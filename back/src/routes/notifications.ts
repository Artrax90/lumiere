import type { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import { config } from '../config.js';
import { notifyNewEpisode } from '../services/telegram.js';

const JACRED_MIRRORS = [
  config.jacred.url,
  'http://ns3bg91xvuqfvq9h.cfhttp.top',
  'http://jacred.xyz',
  'http://jacred.me',
].filter(Boolean);

export function parseTorrentReleaseInfo(title: string): { season: number; episode: number } {
  let season = 0;
  let episode = 0;

  const t = title.replace(/[._]/g, ' ');

  // 1. Explicit SxxExx (e.g. S06E11, S06 E11)
  const sExMatch = t.match(/\bS(\d+)\s*E(\d+)\b/i);
  if (sExMatch) {
    season = parseInt(sExMatch[1], 10);
    episode = parseInt(sExMatch[2], 10);
  }

  // 1b. Bracketed [SSxEE] or [SSxEE-EE] (e.g. [04x01-08], [01x08])
  if (!season) {
    const bracketMatch = t.match(/\[(\d+)x(\d+)(?:[-–—](\d+))?\]/i);
    if (bracketMatch) {
      season = parseInt(bracketMatch[1], 10);
      episode = parseInt(bracketMatch[3] || bracketMatch[2], 10);
    }
  }

  // 2. Season matcher if not found yet
  if (!season) {
    const sMatch =
      t.match(/(\d+)\s*(?:й|ой|ий|ый)?\s*сезон/i) ||
      t.match(/(?:сезон|season)[:\s]+(\d+)/i) ||
      t.match(/\bS(\d+)\b/i);
    if (sMatch) season = parseInt(sMatch[1], 10);
  }

  // 3. Episode / Issue / Series matcher if not found yet
  if (!episode) {
    // Ranges like '1-14 выпуски', 'серии 1-11', 'выпуски 26, 27', 'серии 1-11 из 22'
    const rangeMatch =
      t.match(/(?:выпуск[иа]?|сери[ия]|серии|episodes?|ep)[:\s]*(\d+)\s*[-–—,]\s*(\d+)/i) ||
      t.match(/(\d+)\s*[-–—]\s*(\d+)\s*(?:выпуск|сери)/i);
    if (rangeMatch) {
      episode = Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10));
    } else {
      // Single episode: '10 выпуск', 'выпуск 10', '11 серия', 'серия 11'
      const epMatch =
        t.match(/(?:выпуск[а]?|сери[яи]|episodes?|ep)[:\s]+(\d+)/i) ||
        t.match(/(\d+)\s*(?:выпуск[а]?|сери[яи])/i);
      if (epMatch) episode = parseInt(epMatch[1], 10);
    }
  }

  // Filter out accidental bitrates/years/resolutions (e.g. 1080, 2026)
  if (season >= 50) season = 0;
  if (episode >= 200) episode = 0;

  return { season, episode };
}

async function fetchJacRedReleases(query: string): Promise<Array<{ title: string; publishDate: string }>> {
  const uniqueMirrors = Array.from(new Set(JACRED_MIRRORS));
  for (const mirror of uniqueMirrors) {
    try {
      const url = `${mirror}/api/v2.0/indexers/all/results?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Lumiere/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const data = (await res.json()) as { Results?: Array<{ Title?: string; PublishDate?: string }> };
        if (data.Results && data.Results.length > 0) {
          return data.Results.map((r) => ({
            title: r.Title || '',
            publishDate: r.PublishDate || '',
          }));
        }
      }
    } catch {}
  }
  return [];
}

async function detectLatestRelease(title: string, tmdbId: number, tmdbProvider?: TmdbProvider): Promise<{ season: number; episode: number }> {
  let latestSeason = 0;
  let latestEpisode = 0;

  // 1. Check JacRed torrents
  try {
    const torrents = await fetchJacRedReleases(title);
    for (const item of torrents) {
      const parsed = parseTorrentReleaseInfo(item.title);
      if (parsed.season > latestSeason || (parsed.season === latestSeason && parsed.episode > latestEpisode)) {
        latestSeason = parsed.season;
        latestEpisode = parsed.episode;
      }
    }
  } catch {}

  // 2. Check TMDB details
  if (tmdbProvider && tmdbId) {
    try {
      const details: any = await tmdbProvider.details(tmdbId, 'tv', 'ru');
      if (details && details.seasons) {
        for (const s of details.seasons) {
          const sNum = s.season_number || 0;
          const eNum = s.episode_count || 1;
          if (sNum > 0) {
            if (sNum > latestSeason || (sNum === latestSeason && eNum > latestEpisode)) {
              latestSeason = sNum;
              latestEpisode = eNum;
            }
          }
        }
      }
    } catch {}
  }

  return { season: latestSeason, episode: latestEpisode };
}

// Track last check times per user to throttle background queries
const userLastCheckMap = new Map<number, number>();
let globalLastCheckTime = 0;

export async function checkNewEpisodes(targetUserId?: number, tmdbProvider?: TmdbProvider): Promise<number> {
  let newCount = 0;
  try {
    const querySql = targetUserId
      ? 'SELECT id, user_id, tmdb_id, title, poster, last_season, last_episode FROM series_subscriptions WHERE user_id = $1'
      : 'SELECT id, user_id, tmdb_id, title, poster, last_season, last_episode FROM series_subscriptions';
    const queryParams = targetUserId ? [targetUserId] : [];

    const subsResult = await pool.query(querySql, queryParams);
    const subs = subsResult.rows || [];

    for (const sub of subs) {
      try {
        const detected = await detectLatestRelease(sub.title, sub.tmdb_id, tmdbProvider);
        const latestSeasonNum = detected.season;
        const latestEpisodeNum = detected.episode;

        const prevSeason = sub.last_season || 0;
        const prevEpisode = sub.last_episode || 0;

        const isNewEpisode =
          (latestSeasonNum > prevSeason) ||
          (latestSeasonNum === prevSeason && latestEpisodeNum > prevEpisode) ||
          (prevSeason === 0 && prevEpisode === 0 && (latestSeasonNum > 0 || latestEpisodeNum > 0));

        if (isNewEpisode && (latestSeasonNum > 0 || latestEpisodeNum > 0)) {
          const isTvShow = /шоу|выпуск|club|stand\s*up|comedy|квн|импровиз/i.test(sub.title);
          let epMsg = '';
          if (isTvShow) {
            if (latestEpisodeNum > 0 && latestSeasonNum > 1) {
              epMsg = `Вышел ${latestEpisodeNum} выпуск (${latestSeasonNum} сезон)!`;
            } else if (latestEpisodeNum > 0) {
              epMsg = `Вышел ${latestEpisodeNum} выпуск!`;
            } else {
              epMsg = `Вышел новый выпуск на торрентах!`;
            }
          } else {
            if (latestEpisodeNum > 0 && latestSeasonNum > 0) {
              epMsg = `Вышла ${latestEpisodeNum} серия ${latestSeasonNum} сезона!`;
            } else if (latestSeasonNum > 0) {
              epMsg = `Вышел ${latestSeasonNum} сезон на торрентах!`;
            } else {
              epMsg = `Появились новые серии на торрентах!`;
            }
          }

          // Check if identical unread notification already exists to avoid spamming
          const existingNotif = await pool.query(
            'SELECT id FROM notifications WHERE user_id = $1 AND media_id = $2 AND message = $3 AND is_read = false',
            [sub.user_id, sub.tmdb_id, epMsg]
          );

          if (!existingNotif.rows || existingNotif.rows.length === 0) {
            await pool.query(
              `INSERT INTO notifications (user_id, title, message, media_type, media_id, poster, action_data, is_read)
               VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
              [
                sub.user_id,
                sub.title,
                epMsg,
                'tv',
                sub.tmdb_id,
                sub.poster || '',
                JSON.stringify({ seriesId: sub.tmdb_id, season: latestSeasonNum, episode: latestEpisodeNum, title: sub.title }),
              ]
            );
            newCount++;

            // Trigger Telegram Push Notification if user configured Telegram Bot
            notifyNewEpisode(
              sub.user_id,
              sub.title,
              latestSeasonNum,
              latestEpisodeNum,
              sub.poster || '',
              { seriesId: sub.tmdb_id }
            ).catch((tErr) => console.warn(`[Notifications] Telegram notify error:`, tErr.message));
          }

          // Update subscription baseline
          await pool.query(
            `UPDATE series_subscriptions SET last_season = $1, last_episode = $2 WHERE user_id = $3 AND tmdb_id = $4`,
            [latestSeasonNum, latestEpisodeNum, sub.user_id, sub.tmdb_id]
          );
        }
      } catch (subErr: any) {
        console.warn(`[Notifications] Error checking series "${sub.title}":`, subErr.message);
      }
    }

    if (targetUserId) {
      userLastCheckMap.set(targetUserId, Date.now());
    } else {
      globalLastCheckTime = Date.now();
    }
  } catch (err: any) {
    console.error('[Notifications] checkNewEpisodes fatal error:', err.message);
  }
  return newCount;
}

export function startNotificationScheduler(tmdbProvider?: TmdbProvider) {
  // 1. Initial check 10 seconds after boot
  setTimeout(() => {
    checkNewEpisodes(undefined, tmdbProvider)
      .then((c) => {
        if (c > 0) console.log(`[Notifications] Initial check found ${c} new episode release(s)`);
      })
      .catch(() => {});
  }, 10000);

  // 2. Periodic background check every 20 minutes
  setInterval(() => {
    checkNewEpisodes(undefined, tmdbProvider)
      .then((c) => {
        if (c > 0) console.log(`[Notifications] Periodic check found ${c} new episode release(s)`);
      })
      .catch(() => {});
  }, 20 * 60 * 1000);

  console.log('[Notifications] Background episode checker scheduled (every 20 min)');
}

export function notificationRoutes(app: FastifyInstance, tmdbProvider?: TmdbProvider) {
  // 1. Get notifications
  app.get('/api/notifications', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);

    // Trigger an asynchronous background check if user has not been checked in the last 10 minutes
    const lastCheck = userLastCheckMap.get(userId) || 0;
    if (Date.now() - lastCheck > 10 * 60 * 1000) {
      userLastCheckMap.set(userId, Date.now());
      checkNewEpisodes(userId, tmdbProvider).catch(() => {});
    }

    try {
      const result = await pool.query(
        'SELECT id, title, message, media_type, media_id, poster, action_data, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50',
        [userId]
      );
      const unreadResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );
      const unreadCount = (unreadResult.rows[0] && unreadResult.rows[0].count) || 0;
      return {
        notifications: result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          message: row.message,
          mediaType: row.media_type,
          mediaId: row.media_id,
          poster: row.poster,
          actionData: row.action_data || {},
          isRead: !!row.is_read,
          createdAt: row.created_at,
        })),
        unreadCount,
      };
    } catch (err: any) {
      return { notifications: [], unreadCount: 0 };
    }
  });

  // 2. Mark notification as read
  app.put('/api/notifications/:id/read', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    try {
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [parseInt(id, 10), userId]
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 3. Mark all notifications as read
  app.put('/api/notifications/read-all', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE user_id = $1',
        [userId]
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 4. Get series subscriptions
  app.get('/api/notifications/subscriptions', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);
    try {
      const result = await pool.query(
        'SELECT id, tmdb_id, title, poster, last_season, last_episode, created_at FROM series_subscriptions WHERE user_id = $1 ORDER BY id DESC',
        [userId]
      );
      return {
        subscriptions: result.rows.map((row) => ({
          id: row.id,
          tmdbId: row.tmdb_id,
          title: row.title,
          poster: row.poster,
          lastSeason: row.last_season,
          lastEpisode: row.last_episode,
          createdAt: row.created_at,
        })),
      };
    } catch (err: any) {
      return { subscriptions: [] };
    }
  });

  // 5. Check if user is subscribed to a series
  app.get('/api/notifications/is-subscribed/:tmdbId', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);
    const { tmdbId } = request.params as { tmdbId: string };
    try {
      const result = await pool.query(
        'SELECT id, tmdb_id, title, last_season, last_episode FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2',
        [userId, parseInt(tmdbId, 10)]
      );
      return {
        isSubscribed: result.rows.length > 0,
        subscription: result.rows[0] || null,
      };
    } catch {
      return { isSubscribed: false };
    }
  });

  // 6. Subscribe to a series
  app.post('/api/notifications/subscribe', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (bodyUserId ? parseInt(bodyUserId, 10) : 1);
    const { tmdbId, title, poster, lastSeason, lastEpisode } = request.body as {
      tmdbId: number;
      title: string;
      poster?: string;
      lastSeason?: number;
      lastEpisode?: number;
    };

    if (!tmdbId || !title) {
      return { success: false, error: 'tmdbId and title are required' };
    }

    try {
      let initSeason = lastSeason || 0;
      let initEpisode = lastEpisode || 0;

      // If not provided, query current baseline so user doesn't get flooded with past episodes
      if (initSeason === 0 && initEpisode === 0) {
        const detected = await detectLatestRelease(title, tmdbId, tmdbProvider);
        initSeason = detected.season;
        initEpisode = detected.episode;
      }

      await pool.query(
        `INSERT INTO series_subscriptions (user_id, tmdb_id, title, poster, last_season, last_episode)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, tmdb_id) DO UPDATE
         SET title = EXCLUDED.title, poster = EXCLUDED.poster, last_season = EXCLUDED.last_season, last_episode = EXCLUDED.last_episode`,
        [userId, tmdbId, title, poster || '', initSeason, initEpisode]
      );
      return { success: true, isSubscribed: true, lastSeason: initSeason, lastEpisode: initEpisode };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 7. Unsubscribe from a series
  app.delete('/api/notifications/subscribe/:tmdbId', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);
    const { tmdbId } = request.params as { tmdbId: string };
    try {
      await pool.query(
        'DELETE FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2',
        [userId, parseInt(tmdbId, 10)]
      );
      return { success: true, isSubscribed: false };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 8. Check for new episodes across subscribed series (manual or direct trigger)
  app.post('/api/notifications/check', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);
    try {
      const newCount = await checkNewEpisodes(userId, tmdbProvider);
      return { success: true, newEpisodesFound: newCount };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 9. EPG Reminders / Auto-switch
  app.get('/api/epg/reminders', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const result = await pool.query(
        'SELECT id, channel_id, channel_name, program_title, start_ms, stop_ms, auto_switch, created_at FROM epg_reminders WHERE user_id = $1 ORDER BY start_ms ASC',
        [userId]
      );
      return {
        reminders: result.rows.map((row) => ({
          id: row.id,
          channelId: row.channel_id,
          channelName: row.channel_name,
          programTitle: row.program_title,
          startMs: Number(row.start_ms),
          stopMs: Number(row.stop_ms),
          autoSwitch: !!row.auto_switch,
          createdAt: row.created_at,
        })),
      };
    } catch (err: any) {
      return { reminders: [] };
    }
  });

  app.post('/api/epg/reminders', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { channelId, channelName, programTitle, startMs, stopMs, autoSwitch } = request.body as {
      channelId: string;
      channelName: string;
      programTitle: string;
      startMs: number;
      stopMs: number;
      autoSwitch?: boolean;
    };

    if (!channelId || !programTitle || !startMs) {
      return { success: false, error: 'Missing required reminder parameters' };
    }

    try {
      const result = await pool.query(
        `INSERT INTO epg_reminders (user_id, channel_id, channel_name, program_title, start_ms, stop_ms, auto_switch)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, channelId, channelName || '', programTitle, startMs, stopMs || startMs + 3600000, autoSwitch !== false]
      );
      return { success: true, id: result.rows[0]?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  app.delete('/api/epg/reminders/:id', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    try {
      await pool.query(
        'DELETE FROM epg_reminders WHERE id = $1 AND user_id = $2',
        [parseInt(id, 10), userId]
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

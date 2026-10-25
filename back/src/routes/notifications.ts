import type { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import { config } from '../config.js';
import { notifyNewEpisode, notifyMovieDigitalRelease } from '../services/telegram.js';

const JACRED_MIRRORS = [
  config.jacred.url,
  'http://ns3bg91xvuqfvq9h.cfhttp.top',
  'http://jacred.xyz',
  'http://jacred.me',
].filter(Boolean);

export function parseMovieReleaseQuality(title: string, sizeBytes?: number): {
  isDigital: boolean;
  quality?: string;
  audio?: string;
  reason?: string;
} {
  const t = title || '';

  // 1. Strict video exclusion: screener/cam tags
  const camVideoRegex = /\b(CAM|CAMRip|HDCAM|TS|TeleSync|TC|TeleCine|DCPRip)\b/i;
  if (camVideoRegex.test(t)) {
    return { isDigital: false, reason: 'Cam/TS video detected' };
  }

  // 2. Strict audio exclusion: screen / line audio tags (even if video is 1080p/4K WEB-DL)
  const screenAudioRegex = /\bLine\b|звук\s*с\s*(?:TS|CAM|экран|кинотеатр)|звук[:\s]*(?:TS|CAM)|звук\s*с\s*Line|Line\s*\/\s*чистый\s*звук\s*отсутствует|\[Line\]|\(Line\)/i;
  if (screenAudioRegex.test(t)) {
    return { isDigital: false, reason: 'Screen audio (Line/TS) detected' };
  }

  // 3. Digital video tag detection
  let quality = '';
  if (/\b(4K|2160p|UHD)\b/i.test(t)) quality = '4K UHD';
  else if (/\b(BDRip|BRRip|Blu[- ]?Ray|BD[- ]?Remux|Remux)\b/i.test(t)) quality = 'BDRip';
  else if (/\b(WEB[- ]?DL|WEBRip)\b/i.test(t)) quality = 'WEB-DL';
  else if (/\b(1080p)\b/i.test(t)) quality = '1080p';
  else if (/\b(HDTV)\b/i.test(t)) quality = 'HDTV';

  if (!quality) {
    return { isDigital: false, reason: 'No digital quality tag' };
  }

  // 4. If size is provided and too small (< 2.0 GB for full movie)
  if (sizeBytes && sizeBytes < 2.0 * 1024 * 1024 * 1024) {
    return { isDigital: false, reason: 'Size too small for full movie' };
  }

  // 5. Clean Russian audio detection
  let audio = '';
  if (/дублированн(?:ый|ое|ая)|DUB|чистый\s*звук|iTunes|Лицензия|Кинопоиск|Okko|Иви|START|Premier/i.test(t)) {
    audio = 'Дублированный [Чистый звук]';
  } else if (/Red\s*Head\s*Sound|RHS|Flarrow\s*Films|Кравец|Кубик\s*в\s*кубе/i.test(t)) {
    audio = 'Профессиональный дубляж (Студия)';
  } else if (/(?:профессиональн(?:ый|ое)|МВО|DVO|многоголос)/i.test(t)) {
    audio = 'Профессиональный [Многоголосый]';
  } else if (/(?:RUS|русский|звук)/i.test(t)) {
    audio = 'Русская дорожка';
  }

  if (!audio) {
    return { isDigital: false, reason: 'No Russian audio found' };
  }

  return { isDigital: true, quality, audio };
}

export function parseTorrentReleaseInfo(title: string): { season: number; episode: number } {
  let season = 0;
  let episode = 0;

  const t = title.replace(/[._]/g, ' ');

  // 1. Explicit SxxExx or SxxE01-13 (e.g. S06E11, S22E01-13, S06 E11)
  const sExMatch = t.match(/\bS(\d+)\s*E(\d+)(?:[-–—](\d+))?\b/i);
  if (sExMatch) {
    season = parseInt(sExMatch[1], 10);
    episode = parseInt(sExMatch[3] || sExMatch[2], 10);
  }

  // 1b. Bracketed [SSxEE] or (SSxEE) or SSхEE (supporting Cyrillic х/Х as well as Latin x)
  if (!season) {
    const bracketMatch =
      t.match(/[\[\(](\d+)[xх](\d+)(?:[-–—](\d+))?[\]\)]/i) ||
      t.match(/\b(\d+)[xх](\d+)(?:[-–—](\d+))?\b/i);
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
    // Ranges like '1-14 выпуски', 'серии 1-13', 'выпуски 26, 27', '1-13 выпуски из 27'
    const rangeMatch =
      t.match(/(?:выпуск[иа]?|сери[ия]|серии|episodes?|ep)[:\s]*(\d+)\s*[-–—,]\s*(\d+)/i) ||
      t.match(/(\d+)\s*[-–—]\s*(\d+)\s*(?:выпуск|сери)/i);
    if (rangeMatch) {
      episode = Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10));
    } else {
      // Single episode: '13 выпуск', 'выпуск 13', '13 серия', 'серия 13'
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

async function fetchJacRedReleases(query: string): Promise<Array<{ title: string; publishDate: string; size?: number }>> {
  const uniqueMirrors = Array.from(new Set(JACRED_MIRRORS));
  for (const mirror of uniqueMirrors) {
    try {
      const url = `${mirror}/api/v2.0/indexers/all/results?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Lumiere/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const data = (await res.json()) as { Results?: Array<{ Title?: string; PublishDate?: string; Size?: number }> };
        if (data.Results && data.Results.length > 0) {
          return data.Results.map((r) => ({
            title: r.Title || '',
            publishDate: r.PublishDate || '',
            size: typeof r.Size === 'number' ? r.Size : undefined,
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

  // 1. Check TMDB details for authentic air date / last episode to air & max seasons
  let details: any = null;
  let maxKnownSeason = 99;
  if (tmdbProvider && tmdbId) {
    try {
      details = await tmdbProvider.details(tmdbId, 'tv', 'ru');
      if (details?.seasons && Array.isArray(details.seasons)) {
        maxKnownSeason = Math.max(...details.seasons.map((s: any) => s.season_number || 0));
      }
      if (details?.last_episode_to_air) {
        const lastAired = details.last_episode_to_air;
        const s = lastAired.season_number || 0;
        const e = lastAired.episode_number || 0;
        let isAired = true;
        if (lastAired.air_date) {
          const airTime = new Date(lastAired.air_date).getTime();
          const now = Date.now() + 24 * 60 * 60 * 1000;
          isAired = airTime <= now;
        }
        if (isAired && s > 0 && e > 0) {
          latestSeason = s;
          latestEpisode = e;
        }
      }
    } catch {}
  }

  // 2. Build expanded queries for Russian franchise titles (e.g. Comedy Club <-> Новый Comedy Club)
  const queriesToSearch = [title];
  if (/comedy\s*club|камеди\s*клаб/i.test(title)) {
    queriesToSearch.unshift('Новый Comedy Club');
    queriesToSearch.push('Камеди Клаб', 'Comedy Club 22');
  }
  const cleanTitle = title.replace(/\s*\(\d{4}\)$/, '').trim();
  if (cleanTitle !== title && !queriesToSearch.includes(cleanTitle)) {
    queriesToSearch.push(cleanTitle);
  }

  // 3. Check JacRed torrents across queries
  for (const q of queriesToSearch) {
    try {
      const torrents = await fetchJacRedReleases(q);
      for (const item of torrents) {
        const parsed = parseTorrentReleaseInfo(item.title);
        // Ignore seasons exceeding TMDB max season + 1 (filters out bogus releases like Звёзды 10x01)
        if (maxKnownSeason > 0 && parsed.season > maxKnownSeason + 1) continue;

        // Ignore episodes drastically exceeding season count if known
        if (details?.seasons) {
          const seasonMeta = details.seasons.find((s: any) => s.season_number === parsed.season);
          if (seasonMeta && seasonMeta.episode_count && parsed.episode > seasonMeta.episode_count + 5) {
            continue;
          }
        }

        if (parsed.season > latestSeason || (parsed.season === latestSeason && parsed.episode > latestEpisode)) {
          latestSeason = parsed.season;
          latestEpisode = parsed.episode;
        }
      }
    } catch {}
  }

  return { season: latestSeason, episode: latestEpisode };
}

export async function detectMovieDigitalRelease(
  title: string,
  year?: number
): Promise<{ isDigital: boolean; quality?: string; audio?: string; torrentTitle?: string }> {
  const queriesToSearch: string[] = [title];
  const cleanTitle = title.replace(/\s*\(\d{4}\)$/, '').trim();
  if (cleanTitle !== title && !queriesToSearch.includes(cleanTitle)) {
    queriesToSearch.push(cleanTitle);
  }
  if (year) {
    const withYear = `${cleanTitle} ${year}`;
    if (!queriesToSearch.includes(withYear)) {
      queriesToSearch.push(withYear);
    }
  }

  for (const q of queriesToSearch) {
    try {
      const torrents = await fetchJacRedReleases(q);
      for (const item of torrents) {
        const parsed = parseMovieReleaseQuality(item.title, item.size);
        if (parsed.isDigital) {
          return {
            isDigital: true,
            quality: parsed.quality,
            audio: parsed.audio,
            torrentTitle: item.title,
          };
        }
      }
    } catch {}
  }

  return { isDigital: false };
}

// Track last check times per user to throttle background queries
const userLastCheckMap = new Map<number, number>();
let globalLastCheckTime = 0;

export async function checkMovieDigitalReleases(targetUserId?: number): Promise<number> {
  let newCount = 0;
  try {
    const querySql = targetUserId
      ? `SELECT id, user_id, tmdb_id, title, poster, media_type, target_quality, is_notified
         FROM series_subscriptions
         WHERE user_id = $1 AND media_type = 'movie' AND (is_notified = false OR is_notified IS NULL)`
      : `SELECT id, user_id, tmdb_id, title, poster, media_type, target_quality, is_notified
         FROM series_subscriptions
         WHERE media_type = 'movie' AND (is_notified = false OR is_notified IS NULL)`;
    const queryParams = targetUserId ? [targetUserId] : [];

    const subsResult = await pool.query(querySql, queryParams);
    const subs = subsResult.rows || [];

    for (const sub of subs) {
      try {
        const detected = await detectMovieDigitalRelease(sub.title);
        if (detected.isDigital) {
          const qualityStr = detected.quality || 'WEB-DL 1080p';
          const audioStr = detected.audio || 'Дублированный [Чистый звук]';
          const releaseMsg = `Фильм вышел в качестве ${qualityStr} с чистым звуком (${audioStr})!`;

          // Check if identical unread notification already exists to avoid duplicate entries
          const existingNotif = await pool.query(
            'SELECT id FROM notifications WHERE user_id = $1 AND media_id = $2 AND message = $3 AND is_read = false',
            [sub.user_id, sub.tmdb_id, releaseMsg]
          );

          if (!existingNotif.rows || existingNotif.rows.length === 0) {
            await pool.query(
              `INSERT INTO notifications (user_id, title, message, media_type, media_id, poster, action_data, is_read)
               VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
              [
                sub.user_id,
                sub.title,
                releaseMsg,
                'movie',
                sub.tmdb_id,
                sub.poster || '',
                JSON.stringify({
                  movieId: sub.tmdb_id,
                  quality: qualityStr,
                  audio: audioStr,
                  title: sub.title,
                }),
              ]
            );
            newCount++;

            // Trigger Telegram Push Notification with poster & 1-click action buttons
            notifyMovieDigitalRelease(
              sub.user_id,
              sub.title,
              qualityStr,
              audioStr,
              sub.poster || '',
              { movieId: sub.tmdb_id }
            ).catch((tErr) => console.warn(`[Notifications] Movie Telegram notify error:`, tErr.message));
          }

          // Mark subscription as notified so we don't spam for this movie
          await pool.query(
            `UPDATE series_subscriptions SET is_notified = true WHERE id = $1`,
            [sub.id]
          );
        }
      } catch (subErr: any) {
        console.warn(`[Notifications] Error checking movie "${sub.title}":`, subErr.message);
      }
    }
  } catch (err: any) {
    console.error('[Notifications] checkMovieDigitalReleases fatal error:', err.message);
  }
  return newCount;
}

export async function checkNewEpisodes(targetUserId?: number, tmdbProvider?: TmdbProvider): Promise<number> {
  let newCount = 0;
  try {
    const querySql = targetUserId
      ? `SELECT id, user_id, tmdb_id, title, poster, last_season, last_episode FROM series_subscriptions WHERE user_id = $1 AND (media_type IS NULL OR media_type = 'tv')`
      : `SELECT id, user_id, tmdb_id, title, poster, last_season, last_episode FROM series_subscriptions WHERE (media_type IS NULL OR media_type = 'tv')`;
    const queryParams = targetUserId ? [targetUserId] : [];

    const subsResult = await pool.query(querySql, queryParams);
    const subs = subsResult.rows || [];

    for (const sub of subs) {
      try {
        const detected = await detectLatestRelease(sub.title, sub.tmdb_id, tmdbProvider);
        const latestSeasonNum = detected.season;
        const latestEpisodeNum = detected.episode;

        let prevSeason = sub.last_season || 0;
        let prevEpisode = sub.last_episode || 0;

        // Auto-correct poisoned baselines (e.g. from the previous bug where planned season episode_count was saved)
        if (latestSeasonNum > 0 && latestEpisodeNum > 0) {
          if (prevSeason > latestSeasonNum || (prevSeason === latestSeasonNum && prevEpisode > latestEpisodeNum)) {
            prevEpisode = Math.max(0, latestEpisodeNum - 1);
            prevSeason = latestSeasonNum;
          }
        }

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
    checkMovieDigitalReleases(undefined)
      .then((c) => {
        if (c > 0) console.log(`[Notifications] Initial check found ${c} new movie digital release(s)`);
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
    checkMovieDigitalReleases(undefined)
      .then((c) => {
        if (c > 0) console.log(`[Notifications] Periodic check found ${c} new movie digital release(s)`);
      })
      .catch(() => {});
  }, 20 * 60 * 1000);

  console.log('[Notifications] Background release checker scheduled (episodes & movie digital releases, every 20 min)');
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
      checkMovieDigitalReleases(userId).catch(() => {});
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
  app.put('/api/notifications/:id/read', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : (bodyUserId ? parseInt(bodyUserId, 10) : 1));
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
  app.put('/api/notifications/read-all', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : (bodyUserId ? parseInt(bodyUserId, 10) : 1));
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

  // 4. Get series and movie subscriptions
  app.get('/api/notifications/subscriptions', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 0);
    if (!userId) {
      return { subscriptions: [] };
    }
    try {
      const result = await pool.query(
        'SELECT id, tmdb_id, title, poster, last_season, last_episode, media_type, target_quality, is_notified, created_at FROM series_subscriptions WHERE user_id = $1 ORDER BY id DESC',
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
          mediaType: row.media_type || 'tv',
          targetQuality: row.target_quality || 'digital',
          isNotified: !!row.is_notified,
          createdAt: row.created_at,
        })),
      };
    } catch (err: any) {
      return { subscriptions: [] };
    }
  });

  // 5. Check if user is subscribed to a series or movie
  app.get('/api/notifications/is-subscribed/:tmdbId', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 0);
    if (!userId) {
      return { isSubscribed: false };
    }
    const { tmdbId } = request.params as { tmdbId: string };
    const queryMediaType = (request.query as any)?.mediaType;
    try {
      const sql = queryMediaType
        ? 'SELECT id, tmdb_id, title, last_season, last_episode, media_type, is_notified FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2 AND media_type = $3'
        : 'SELECT id, tmdb_id, title, last_season, last_episode, media_type, is_notified FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2';
      const params = queryMediaType ? [userId, parseInt(tmdbId, 10), queryMediaType] : [userId, parseInt(tmdbId, 10)];
      const result = await pool.query(sql, params);
      return {
        isSubscribed: result.rows.length > 0,
        subscription: result.rows[0] || null,
      };
    } catch {
      return { isSubscribed: false };
    }
  });

  // 6. Subscribe to a series or movie
  app.post('/api/notifications/subscribe', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (bodyUserId ? parseInt(bodyUserId, 10) : 0);
    if (!userId) {
      return { success: false, error: 'User is required' };
    }
    const { tmdbId, title, poster, mediaType, lastSeason, lastEpisode, year } = request.body as {
      tmdbId: number;
      title: string;
      poster?: string;
      mediaType?: string;
      lastSeason?: number;
      lastEpisode?: number;
      year?: number;
    };

    if (!tmdbId || !title) {
      return { success: false, error: 'tmdbId and title are required' };
    }

    const resolvedMediaType = mediaType === 'movie' ? 'movie' : 'tv';

    try {
      if (resolvedMediaType === 'movie') {
        await pool.query(
          `INSERT INTO series_subscriptions (user_id, tmdb_id, title, poster, last_season, last_episode, media_type, target_quality, is_notified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id, tmdb_id) DO UPDATE
           SET title = EXCLUDED.title, poster = EXCLUDED.poster, media_type = EXCLUDED.media_type, target_quality = EXCLUDED.target_quality, is_notified = false`,
          [userId, tmdbId, title, poster || '', 0, 0, 'movie', 'digital', false]
        );

        // Asynchronously check right away in background in case movie is already digital
        detectMovieDigitalRelease(title, year)
          .then((detected) => {
            if (detected.isDigital) {
              checkMovieDigitalReleases(userId).catch(() => {});
            }
          })
          .catch(() => {});

        return { success: true, isSubscribed: true, mediaType: 'movie' };
      }

      let initSeason = lastSeason || 0;
      let initEpisode = lastEpisode || 0;

      // If not provided, query current baseline so user doesn't get flooded with past episodes
      if (initSeason === 0 && initEpisode === 0) {
        const detected = await detectLatestRelease(title, tmdbId, tmdbProvider);
        initSeason = detected.season;
        initEpisode = detected.episode;
      }

      await pool.query(
        `INSERT INTO series_subscriptions (user_id, tmdb_id, title, poster, last_season, last_episode, media_type, target_quality, is_notified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, tmdb_id) DO UPDATE
         SET title = EXCLUDED.title, poster = EXCLUDED.poster, last_season = EXCLUDED.last_season, last_episode = EXCLUDED.last_episode, media_type = EXCLUDED.media_type`,
        [userId, tmdbId, title, poster || '', initSeason, initEpisode, 'tv', 'digital', false]
      );
      return { success: true, isSubscribed: true, lastSeason: initSeason, lastEpisode: initEpisode, mediaType: 'tv' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 7. Unsubscribe from a series or movie
  app.delete('/api/notifications/subscribe/:tmdbId', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 0);
    if (!userId) {
      return { success: false, error: 'User is required' };
    }
    const { tmdbId } = request.params as { tmdbId: string };
    const queryMediaType = (request.query as any)?.mediaType;
    try {
      const sql = queryMediaType
        ? 'DELETE FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2 AND media_type = $3'
        : 'DELETE FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2';
      const params = queryMediaType ? [userId, parseInt(tmdbId, 10), queryMediaType] : [userId, parseInt(tmdbId, 10)];
      await pool.query(sql, params);
      return { success: true, isSubscribed: false };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 8. Check for new episodes & digital releases (manual or direct trigger)
  app.post('/api/notifications/check', { preHandler: [optionalAuth] }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : (bodyUserId ? parseInt(bodyUserId, 10) : 1));
    try {
      const newEpisodes = await checkNewEpisodes(userId, tmdbProvider);
      const newMovies = await checkMovieDigitalReleases(userId);
      return { success: true, newEpisodesFound: newEpisodes, newMoviesFound: newMovies };
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

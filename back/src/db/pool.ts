import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', '..', 'data');
const fallbackDbPath = path.join(dataDir, 'local_db.json');

// Ensure data dir exists
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
}

interface LocalDb {
  users: any[];
  sessions: any[];
  favorites: any[];
  watchlist: any[];
  watch_history: any[];
  app_settings: any[];
  user_preferences: any[];
  iptv_playlists: any[];
  notifications: any[];
  series_subscriptions: any[];
  epg_reminders: any[];
  playback_sessions: any[];
  playback_history: any[];
}

function loadFallbackDb(): LocalDb {
  try {
    if (fs.existsSync(fallbackDbPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackDbPath, 'utf8'));
      return {
        users: data.users || [],
        sessions: data.sessions || [],
        favorites: data.favorites || [],
        watchlist: data.watchlist || [],
        watch_history: data.watch_history || [],
        app_settings: data.app_settings || [],
        user_preferences: data.user_preferences || [],
        iptv_playlists: data.iptv_playlists || [],
        notifications: data.notifications || [],
        series_subscriptions: data.series_subscriptions || [],
        epg_reminders: data.epg_reminders || [],
        playback_sessions: data.playback_sessions || [],
        playback_history: data.playback_history || [],
      };
    }
  } catch {}
  return {
    users: [],
    sessions: [],
    favorites: [],
    watchlist: [],
    watch_history: [],
    app_settings: [],
    user_preferences: [],
    iptv_playlists: [],
    notifications: [],
    series_subscriptions: [],
    epg_reminders: [],
    playback_sessions: [],
    playback_history: []
  };
}

function saveFallbackDb(db: LocalDb) {
  try {
    fs.writeFileSync(fallbackDbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (err: any) {
    console.error('[DB] Error saving local fallback db:', err.message);
  }
}

let warnedOffline = false;

function executeFallback(sql: string, params: any[] = []): { rows: any[] } {
  const db = loadFallbackDb();
  const cleanSql = sql.trim().replace(/\s+/g, ' ');

  // 1. Migrations / Table creation
  if (cleanSql.startsWith('CREATE TABLE') || cleanSql.startsWith('ALTER TABLE') || cleanSql.startsWith('CREATE INDEX') || cleanSql.startsWith('DROP TABLE')) {
    return { rows: [] };
  }

  // 2. Count users
  if (/SELECT COUNT\(\*\) (as count )?FROM users WHERE role = 'admin'/i.test(cleanSql)) {
    const adminCount = db.users.filter((u) => u.role === 'admin').length;
    return { rows: [{ count: String(adminCount) }] };
  }
  if (/SELECT COUNT\(\*\) (as count )?FROM users/i.test(cleanSql)) {
    return { rows: [{ count: String(db.users.length) }] };
  }

  // 3. User Lookup by ID
  if (/SELECT .* FROM users WHERE id = \$1/i.test(cleanSql)) {
    const targetId = Number(params[0]);
    const user = db.users.find((u) => u.id === targetId);
    if (!user) return { rows: [] };
    return {
      rows: [
        {
          ...user,
          has_pin: !!(user.pin && String(user.pin).trim() !== ''),
        },
      ],
    };
  }

  // 4. User Lookup by Email
  if (/SELECT .* FROM users WHERE email = \$1/i.test(cleanSql)) {
    const cleanEmail = (params[0] || '').toLowerCase().trim();
    const user = db.users.find((u) => (u.email || '').toLowerCase().trim() === cleanEmail);
    if (!user) return { rows: [] };
    return {
      rows: [
        {
          ...user,
          has_pin: !!(user.pin && String(user.pin).trim() !== ''),
        },
      ],
    };
  }

  // 5. Select All Users / Profiles
  if (/SELECT .* FROM users/i.test(cleanSql)) {
    const sorted = [...db.users].sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return a.id - b.id;
    });
    return {
      rows: sorted.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        avatar: u.avatar || '',
        role: u.role || 'user',
        is_kids: !!u.is_kids,
        has_pin: !!(u.pin && String(u.pin).trim() !== ''),
        pin: u.pin || '',
        created_at: u.created_at || new Date().toISOString(),
      })),
    };
  }

  // 6. Insert User (Admin setup or Admin add user)
  if (/INSERT INTO users/i.test(cleanSql)) {
    const nextId = (db.users.reduce((max, u) => Math.max(max, u.id || 0), 0) || 0) + 1;
    let newUser: any = {
      id: nextId,
      created_at: new Date().toISOString(),
    };

    if (params.length === 3) {
      // INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')
      newUser.email = (params[0] || '').toLowerCase().trim();
      newUser.password_hash = params[1];
      newUser.name = params[2] || '';
      newUser.role = cleanSql.includes("'admin'") ? 'admin' : 'user';
      newUser.pin = '';
      newUser.is_kids = false;
      newUser.avatar = '';
    } else if (params.length >= 7) {
      // INSERT INTO users (email, password_hash, name, role, pin, is_kids, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7)
      newUser.email = (params[0] || '').toLowerCase().trim();
      newUser.password_hash = params[1];
      newUser.name = params[2] || '';
      newUser.role = params[3] || 'user';
      newUser.pin = params[4] || '';
      newUser.is_kids = !!params[5];
      newUser.avatar = params[6] || '';
    } else {
      newUser.email = (params[0] || '').toLowerCase().trim();
      newUser.password_hash = params[1] || '';
      newUser.name = params[2] || '';
      newUser.role = 'user';
      newUser.pin = '';
      newUser.is_kids = false;
      newUser.avatar = '';
    }

    db.users.push(newUser);
    saveFallbackDb(db);
    return {
      rows: [
        {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          avatar: newUser.avatar,
          is_kids: newUser.is_kids,
          has_pin: !!(newUser.pin && String(newUser.pin).trim() !== ''),
          created_at: newUser.created_at,
        },
      ],
    };
  }

  // 7. Update User
  if (/UPDATE users SET/i.test(cleanSql)) {
    const targetUserId = Number(params[params.length - 1]);
    const user = db.users.find((u) => u.id === targetUserId);
    if (!user) return { rows: [] };

    // Update fields from params
    if (cleanSql.includes('name =')) {
      const idx = cleanSql.indexOf('name = $');
      const paramNum = parseInt(cleanSql.slice(idx + 8, idx + 10));
      if (params[paramNum - 1] !== undefined) user.name = params[paramNum - 1];
    }
    if (cleanSql.includes('email =')) {
      const idx = cleanSql.indexOf('email = $');
      const paramNum = parseInt(cleanSql.slice(idx + 9, idx + 11));
      if (params[paramNum - 1] !== undefined) user.email = params[paramNum - 1];
    }
    if (cleanSql.includes('password_hash =')) {
      const idx = cleanSql.indexOf('password_hash = $');
      const paramNum = parseInt(cleanSql.slice(idx + 17, idx + 19));
      if (params[paramNum - 1] !== undefined) user.password_hash = params[paramNum - 1];
    }
    if (cleanSql.includes('role =')) {
      const idx = cleanSql.indexOf('role = $');
      const paramNum = parseInt(cleanSql.slice(idx + 8, idx + 10));
      if (params[paramNum - 1] !== undefined) user.role = params[paramNum - 1];
    }
    if (cleanSql.includes('pin =')) {
      const idx = cleanSql.indexOf('pin = $');
      const paramNum = parseInt(cleanSql.slice(idx + 7, idx + 9));
      if (params[paramNum - 1] !== undefined) user.pin = params[paramNum - 1];
    }
    if (cleanSql.includes('is_kids =')) {
      const idx = cleanSql.indexOf('is_kids = $');
      const paramNum = parseInt(cleanSql.slice(idx + 11, idx + 13));
      if (params[paramNum - 1] !== undefined) user.is_kids = !!params[paramNum - 1];
    }
    if (cleanSql.includes('avatar =')) {
      const idx = cleanSql.indexOf('avatar = $');
      const paramNum = parseInt(cleanSql.slice(idx + 10, idx + 12));
      if (params[paramNum - 1] !== undefined) user.avatar = params[paramNum - 1];
    }

    saveFallbackDb(db);
    return {
      rows: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          is_kids: user.is_kids,
          has_pin: !!(user.pin && String(user.pin).trim() !== ''),
          created_at: user.created_at,
        },
      ],
    };
  }

  // 8. Delete User
  if (/DELETE FROM users WHERE id = \$1/i.test(cleanSql)) {
    const targetId = Number(params[0]);
    db.users = db.users.filter((u) => u.id !== targetId);
    db.sessions = db.sessions.filter((s) => s.user_id !== targetId);
    db.favorites = db.favorites.filter((f) => f.user_id !== targetId);
    db.watch_history = db.watch_history.filter((w) => w.user_id !== targetId);
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 9. Sessions
  if (/INSERT INTO sessions/i.test(cleanSql)) {
    db.sessions.push({
      user_id: params[0],
      refresh_token: params[1],
      expires_at: params[2],
    });
    saveFallbackDb(db);
    return { rows: [] };
  }
  if (/SELECT id FROM sessions WHERE refresh_token = \$1/i.test(cleanSql)) {
    const session = db.sessions.find((s) => s.refresh_token === params[0]);
    return { rows: session ? [{ id: 1 }] : [] };
  }
  if (/DELETE FROM sessions WHERE refresh_token = \$1/i.test(cleanSql)) {
    db.sessions = db.sessions.filter((s) => s.refresh_token !== params[0]);
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 10. Favorites
  if (/SELECT .* FROM favorites WHERE user_id = \$1/i.test(cleanSql)) {
    const favs = db.favorites.filter((f) => f.user_id === Number(params[0]));
    return { rows: favs };
  }
  if (/INSERT INTO favorites/i.test(cleanSql)) {
    const nextId = db.favorites.length + 1;
    const item = {
      id: nextId,
      user_id: params[0],
      tmdb_id: params[1],
      media_type: params[2],
      title_name: params[3],
      poster: params[4] || '',
      added_at: new Date().toISOString(),
    };
    db.favorites.push(item);
    saveFallbackDb(db);
    return { rows: [{ id: nextId }] };
  }
  if (/DELETE FROM favorites WHERE user_id = \$1 AND tmdb_id = \$2/i.test(cleanSql)) {
    db.favorites = db.favorites.filter((f) => !(f.user_id === Number(params[0]) && f.tmdb_id === Number(params[1])));
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 10b. Watchlist ("Буду смотреть")
  if (/SELECT .* FROM watchlist WHERE user_id = \$1/i.test(cleanSql)) {
    const list = db.watchlist.filter((w) => w.user_id === Number(params[0]));
    return { rows: list };
  }
  if (/INSERT INTO watchlist/i.test(cleanSql)) {
    const nextId = db.watchlist.length + 1;
    const item = {
      id: nextId,
      user_id: params[0],
      tmdb_id: params[1],
      media_type: params[2],
      title_name: params[3],
      poster: params[4] || '',
      added_at: new Date().toISOString(),
    };
    db.watchlist.push(item);
    saveFallbackDb(db);
    return { rows: [{ id: nextId }] };
  }
  if (/DELETE FROM watchlist WHERE user_id = \$1 AND tmdb_id = \$2/i.test(cleanSql)) {
    db.watchlist = db.watchlist.filter((w) => !(w.user_id === Number(params[0]) && w.tmdb_id === Number(params[1])));
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 11. Watch History
  if (/SELECT .* FROM watch_history WHERE user_id = \$1/i.test(cleanSql)) {
    const hist = db.watch_history.filter((w) => w.user_id === Number(params[0]));
    return { rows: hist };
  }
  if (/DELETE FROM watch_history WHERE user_id = \$1 AND tmdb_id = \$2/i.test(cleanSql)) {
    db.watch_history = db.watch_history.filter((w) => !(w.user_id === Number(params[0]) && w.tmdb_id === Number(params[1])));
    saveFallbackDb(db);
    return { rows: [] };
  }
  if (/INSERT INTO watch_history/i.test(cleanSql)) {
    const existingIdx = db.watch_history.findIndex((w) => w.user_id === Number(params[0]) && w.tmdb_id === Number(params[1]) && w.media_type === params[2]);
    const item = {
      id: existingIdx >= 0 ? db.watch_history[existingIdx].id : db.watch_history.length + 1,
      user_id: params[0],
      tmdb_id: params[1],
      media_type: params[2],
      title_name: params[3],
      poster: params[4] || '',
      progress: params[5] || 0,
      timestamp: params[6] || 0,
      updated_at: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      db.watch_history[existingIdx] = item;
    } else {
      db.watch_history.push(item);
    }
    saveFallbackDb(db);
    return { rows: [{ id: item.id }] };
  }

  // 12. App Settings
  if (/SELECT key, value FROM app_settings/i.test(cleanSql)) {
    return { rows: db.app_settings };
  }
  if (/INSERT INTO app_settings/i.test(cleanSql)) {
    const existingIdx = db.app_settings.findIndex((s) => s.key === params[0]);
    if (existingIdx >= 0) {
      db.app_settings[existingIdx].value = params[1];
    } else {
      db.app_settings.push({ key: params[0], value: params[1] });
    }
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 13. User Preferences
  if (/SELECT preferences FROM user_preferences WHERE user_id = \$1/i.test(cleanSql)) {
    const pref = db.user_preferences.find((p) => p.user_id === Number(params[0]));
    return { rows: pref ? [{ preferences: pref.preferences }] : [] };
  }
  if (/INSERT INTO user_preferences/i.test(cleanSql)) {
    const existingIdx = db.user_preferences.findIndex((p) => p.user_id === Number(params[0]));
    const prefObj = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
    if (existingIdx >= 0) {
      db.user_preferences[existingIdx].preferences = prefObj;
      db.user_preferences[existingIdx].updated_at = new Date().toISOString();
    } else {
      db.user_preferences.push({ user_id: Number(params[0]), preferences: prefObj, updated_at: new Date().toISOString() });
    }
    saveFallbackDb(db);
    return { rows: [{ preferences: prefObj }] };
  }

  // 14. IPTV Playlists
  if (/SELECT .* FROM iptv_playlists WHERE user_id = \$1/i.test(cleanSql)) {
    const lists = db.iptv_playlists.filter((p) => p.user_id === Number(params[0]));
    return { rows: lists };
  }
  if (/INSERT INTO iptv_playlists/i.test(cleanSql)) {
    const existingIdx = db.iptv_playlists.findIndex((p) => p.user_id === Number(params[0]) && p.url === params[2]);
    const item = {
      user_id: Number(params[0]),
      name: params[1],
      url: params[2],
      epg_url: params[3] || '',
      updated_at: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      db.iptv_playlists[existingIdx] = item;
    } else {
      db.iptv_playlists.push(item);
    }
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 15. Notifications
  if (/SELECT COUNT\(\*\)::int AS count FROM notifications WHERE user_id = \$1 AND is_read = false/i.test(cleanSql)) {
    const count = db.notifications.filter((n) => n.user_id === Number(params[0]) && !n.is_read).length;
    return { rows: [{ count }] };
  }
  if (/SELECT .* FROM notifications WHERE user_id = \$1/i.test(cleanSql)) {
    const notifs = db.notifications
      .filter((n) => n.user_id === Number(params[0]))
      .sort((a, b) => b.id - a.id);
    return { rows: notifs };
  }
  if (/INSERT INTO notifications/i.test(cleanSql)) {
    const nextId = db.notifications.length > 0 ? Math.max(...db.notifications.map((n) => n.id || 0)) + 1 : 1;
    const actionData = typeof params[6] === 'string' ? JSON.parse(params[6]) : params[6] || {};
    const item = {
      id: nextId,
      user_id: Number(params[0]),
      title: params[1],
      message: params[2],
      media_type: params[3] || 'tv',
      media_id: Number(params[4]),
      poster: params[5] || '',
      action_data: actionData,
      is_read: false,
      created_at: new Date().toISOString()
    };
    db.notifications.push(item);
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/UPDATE notifications SET is_read = true WHERE id = \$1 AND user_id = \$2/i.test(cleanSql)) {
    const notif = db.notifications.find((n) => n.id === Number(params[0]) && n.user_id === Number(params[1]));
    if (notif) notif.is_read = true;
    saveFallbackDb(db);
    return { rows: notif ? [notif] : [] };
  }
  if (/UPDATE notifications SET is_read = true WHERE user_id = \$1/i.test(cleanSql)) {
    db.notifications.forEach((n) => {
      if (n.user_id === Number(params[0])) n.is_read = true;
    });
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 16. Series Subscriptions
  if (/SELECT .* FROM series_subscriptions WHERE user_id = \$1 AND tmdb_id = \$2/i.test(cleanSql)) {
    const sub = db.series_subscriptions.find((s) => s.user_id === Number(params[0]) && s.tmdb_id === Number(params[1]));
    return { rows: sub ? [sub] : [] };
  }
  if (/SELECT .* FROM series_subscriptions WHERE user_id = \$1/i.test(cleanSql)) {
    const subs = db.series_subscriptions
      .filter((s) => s.user_id === Number(params[0]))
      .sort((a, b) => b.id - a.id);
    return { rows: subs };
  }
  if (/INSERT INTO series_subscriptions/i.test(cleanSql)) {
    const existingIdx = db.series_subscriptions.findIndex((s) => s.user_id === Number(params[0]) && s.tmdb_id === Number(params[1]));
    const nextId = db.series_subscriptions.length > 0 ? Math.max(...db.series_subscriptions.map((s) => s.id || 0)) + 1 : 1;
    const item = {
      id: existingIdx >= 0 ? db.series_subscriptions[existingIdx].id : nextId,
      user_id: Number(params[0]),
      tmdb_id: Number(params[1]),
      title: params[2],
      poster: params[3] || '',
      last_season: Number(params[4] || 0),
      last_episode: Number(params[5] || 0),
      created_at: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      db.series_subscriptions[existingIdx] = item;
    } else {
      db.series_subscriptions.push(item);
    }
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/DELETE FROM series_subscriptions WHERE user_id = \$1 AND tmdb_id = \$2/i.test(cleanSql)) {
    db.series_subscriptions = db.series_subscriptions.filter((s) => !(s.user_id === Number(params[0]) && s.tmdb_id === Number(params[1])));
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 17. EPG Reminders
  if (/SELECT .* FROM epg_reminders WHERE user_id = \$1/i.test(cleanSql)) {
    const reminders = db.epg_reminders
      .filter((r) => r.user_id === Number(params[0]))
      .sort((a, b) => a.start_ms - b.start_ms);
    return { rows: reminders };
  }
  if (/INSERT INTO epg_reminders/i.test(cleanSql)) {
    const nextId = db.epg_reminders.length > 0 ? Math.max(...db.epg_reminders.map((r) => r.id || 0)) + 1 : 1;
    const item = {
      id: nextId,
      user_id: Number(params[0]),
      channel_id: params[1],
      channel_name: params[2],
      program_title: params[3],
      start_ms: Number(params[4]),
      stop_ms: Number(params[5]),
      auto_switch: params[6] !== false,
      created_at: new Date().toISOString()
    };
    db.epg_reminders.push(item);
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/DELETE FROM epg_reminders WHERE id = \$1 AND user_id = \$2/i.test(cleanSql)) {
    db.epg_reminders = db.epg_reminders.filter((r) => !(r.id === Number(params[0]) && r.user_id === Number(params[1])));
    saveFallbackDb(db);
    return { rows: [] };
  }

  if (db.playback_sessions === undefined) db.playback_sessions = [];
  if (db.playback_history === undefined) db.playback_history = [];

  // 18. Playback Sessions
  if (/SELECT .* FROM playback_sessions .* WHERE .*last_heartbeat/i.test(cleanSql) || /SELECT .* FROM playback_sessions/i.test(cleanSql)) {
    if (/WHERE id = \$1/i.test(cleanSql)) {
      const s = db.playback_sessions.find((sess) => String(sess.id) === String(params[0]));
      return { rows: s ? [s] : [] };
    }
    // Return all sessions active within 5 minutes
    const threshold = Date.now() - 300000;
    const activeSessions = db.playback_sessions
      .filter((s) => new Date(s.last_heartbeat).getTime() >= threshold)
      .map((s) => {
        const u = db.users.find((user) => user.id === s.user_id) || {};
        return {
          ...s,
          user_name: u.name || s.device_name || 'Пользователь',
          user_avatar: u.avatar || '',
          user_email: u.email || '',
          is_kids: !!u.is_kids
        };
      })
      .sort((a, b) => new Date(b.last_heartbeat).getTime() - new Date(a.last_heartbeat).getTime());
    return { rows: activeSessions };
  }
  if (/INSERT INTO playback_sessions/i.test(cleanSql)) {
    const existingIdx = db.playback_sessions.findIndex((s) => String(s.id) === String(params[0]));
    const item = {
      id: String(params[0]),
      user_id: params[1] ? Number(params[1]) : (db.users[0]?.id || 1),
      device_type: params[2] || 'web',
      device_name: params[3] || '',
      client_ip: params[4] || '',
      media_type: params[5] || 'movie',
      media_id: String(params[6] || ''),
      media_title: params[7] || '',
      media_poster: params[8] || '',
      season: Number(params[9] || 0),
      episode: Number(params[10] || 0),
      current_time: Number(params[11] || 0),
      duration: Number(params[12] || 0),
      is_paused: !!params[13],
      terminate_requested: existingIdx >= 0 ? !!db.playback_sessions[existingIdx].terminate_requested : false,
      started_at: existingIdx >= 0 ? db.playback_sessions[existingIdx].started_at : new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      db.playback_sessions[existingIdx] = item;
    } else {
      db.playback_sessions.push(item);
    }
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/UPDATE playback_sessions SET terminate_requested = true WHERE id = \$1/i.test(cleanSql)) {
    const s = db.playback_sessions.find((sess) => String(sess.id) === String(params[0]));
    if (s) s.terminate_requested = true;
    saveFallbackDb(db);
    return { rows: s ? [s] : [] };
  }
  if (/DELETE FROM playback_sessions WHERE id = \$1/i.test(cleanSql)) {
    db.playback_sessions = db.playback_sessions.filter((s) => String(s.id) !== String(params[0]));
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 19. Playback History
  if (/SELECT .* FROM playback_history/i.test(cleanSql)) {
    let list = [...(db.playback_history || [])];
    if (/WHERE .*user_id = \$1/i.test(cleanSql)) {
      list = list.filter((h) => h.user_id === Number(params[0]));
    }
    if (/media_id = \$2/i.test(cleanSql)) {
      list = list.filter((h) => String(h.media_id) === String(params[1]));
    }
    if (/media_type = \$3/i.test(cleanSql)) {
      list = list.filter((h) => h.media_type === params[2]);
    }
    if (/season = \$4/i.test(cleanSql)) {
      list = list.filter((h) => Number(h.season) === Number(params[3]));
    }
    if (/episode = \$5/i.test(cleanSql)) {
      list = list.filter((h) => Number(h.episode) === Number(params[4]));
    }
    if (/INTERVAL '4 hours'/i.test(cleanSql)) {
      const fourHoursAgo = Date.now() - 4 * 3600 * 1000;
      list = list.filter((h) => new Date(h.ended_at).getTime() > fourHoursAgo);
    }
    const mapped = list.map((h) => {
      const u = (db.users || []).find((user) => user.id === h.user_id) || {};
      return {
        ...h,
        user_name: u.name || 'Пользователь',
        user_avatar: u.avatar || '',
      };
    }).sort((a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime());

    return { rows: mapped };
  }
  if (/INSERT INTO playback_history/i.test(cleanSql)) {
    if (!db.playback_history) db.playback_history = [];
    const nextId = db.playback_history.length > 0 ? Math.max(...db.playback_history.map((h) => h.id || 0)) + 1 : 1;
    const item = {
      id: nextId,
      user_id: Number(params[0]),
      device_type: params[1] || 'web',
      device_name: params[2] || '',
      media_type: params[3] || 'movie',
      media_id: String(params[4] || ''),
      media_title: params[5] || '',
      media_poster: params[6] || '',
      season: Number(params[7] || 0),
      episode: Number(params[8] || 0),
      watched_seconds: Number(params[9] || 0),
      duration: Number(params[10] || 0),
      completed: !!params[11],
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString()
    };
    db.playback_history.push(item);
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/UPDATE playback_history SET .* WHERE id = \$/i.test(cleanSql)) {
    if (!db.playback_history) db.playback_history = [];
    const histId = Number(params[params.length - 1]);
    const item = db.playback_history.find((h) => h.id === histId);
    if (item) {
      if (params[0] !== undefined) item.watched_seconds = Math.max(item.watched_seconds || 0, Number(params[0]));
      if (params[1] !== undefined) item.duration = Math.max(item.duration || 0, Number(params[1]));
      if (params[2] !== undefined) item.completed = !!params[2];
      if (params[3] !== undefined) item.device_type = params[3];
      if (params[4] !== undefined) item.device_name = params[4];
      item.ended_at = new Date().toISOString();
    }
    saveFallbackDb(db);
    return { rows: item ? [item] : [] };
  }
  if (/DELETE FROM playback_history WHERE id = \$1/i.test(cleanSql)) {
    db.playback_history = db.playback_history.filter((h) => h.id !== Number(params[0]));
    saveFallbackDb(db);
    return { rows: [] };
  }
  if (/DELETE FROM playback_history WHERE user_id = \$1/i.test(cleanSql)) {
    db.playback_history = db.playback_history.filter((h) => h.user_id !== Number(params[0]));
    saveFallbackDb(db);
    return { rows: [] };
  }
  if (/DELETE FROM playback_history/i.test(cleanSql)) {
    db.playback_history = [];
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 20. Transactions
  if (cleanSql === 'BEGIN' || cleanSql === 'COMMIT' || cleanSql === 'ROLLBACK') {
    return { rows: [] };
  }

  // 21. IPTV Playlists
  if (db.iptv_playlists === undefined) db.iptv_playlists = [];
  if (/SELECT .* FROM iptv_playlists WHERE user_id = \$1/i.test(cleanSql)) {
    const list = db.iptv_playlists.filter((p) => p.user_id === Number(params[0]));
    return { rows: list };
  }
  if (/INSERT INTO iptv_playlists/i.test(cleanSql)) {
    const uId = Number(params[0]);
    const name = params[1] || '';
    const url = params[2] || '';
    const epgUrl = params[3] || '';
    const existingIdx = db.iptv_playlists.findIndex((p) => p.user_id === uId && p.url === url);
    const item = {
      user_id: uId,
      name,
      url,
      epg_url: epgUrl,
      updated_at: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      db.iptv_playlists[existingIdx] = item;
    } else {
      db.iptv_playlists.push(item);
    }
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/DELETE FROM iptv_playlists WHERE user_id = \$1/i.test(cleanSql)) {
    db.iptv_playlists = db.iptv_playlists.filter((p) => p.user_id !== Number(params[0]));
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 22. Watch History
  if (db.watch_history === undefined) db.watch_history = [];
  if (/SELECT .* FROM watch_history WHERE user_id = \$1 AND tmdb_id = \$2 AND media_type = \$3/i.test(cleanSql)) {
    const item = db.watch_history.find((h) => h.user_id === Number(params[0]) && h.tmdb_id === Number(params[1]) && h.media_type === params[2]);
    return { rows: item ? [item] : [] };
  }
  if (/SELECT .* FROM watch_history WHERE user_id = \$1/i.test(cleanSql)) {
    const list = db.watch_history
      .filter((h) => h.user_id === Number(params[0]))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return { rows: list };
  }
  if (/INSERT INTO watch_history/i.test(cleanSql)) {
    const uId = Number(params[0]);
    const tmdbId = Number(params[1]);
    const mediaType = params[2] || 'movie';
    const titleName = params[3] || '';
    const poster = params[4] || '';
    const progress = Number(params[5] || 0);
    const timestamp = Number(params[6] || 0);
    const existingIdx = db.watch_history.findIndex((h) => h.user_id === uId && h.tmdb_id === tmdbId && h.media_type === mediaType);
    const item = {
      id: existingIdx >= 0 ? db.watch_history[existingIdx].id : db.watch_history.length + 1,
      user_id: uId,
      tmdb_id: tmdbId,
      media_type: mediaType,
      title_name: titleName,
      poster,
      progress,
      timestamp,
      updated_at: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      db.watch_history[existingIdx] = {
        ...db.watch_history[existingIdx],
        progress: Math.max(db.watch_history[existingIdx].progress || 0, progress),
        timestamp: Math.max(db.watch_history[existingIdx].timestamp || 0, timestamp),
        title_name: titleName || db.watch_history[existingIdx].title_name,
        poster: poster || db.watch_history[existingIdx].poster,
        updated_at: new Date().toISOString()
      };
    } else {
      db.watch_history.push(item);
    }
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/DELETE FROM watch_history WHERE user_id = \$1/i.test(cleanSql)) {
    db.watch_history = db.watch_history.filter((h) => h.user_id !== Number(params[0]));
    saveFallbackDb(db);
    return { rows: [] };
  }

  // 23. Favorites
  if (db.favorites === undefined) db.favorites = [];
  if (/SELECT .* FROM favorites WHERE user_id = \$1/i.test(cleanSql)) {
    const list = db.favorites
      .filter((f) => f.user_id === Number(params[0]))
      .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
    return { rows: list };
  }
  if (/INSERT INTO favorites/i.test(cleanSql)) {
    const uId = Number(params[0]);
    const tmdbId = Number(params[1]);
    const mediaType = params[2] || 'movie';
    const titleName = params[3] || '';
    const poster = params[4] || '';
    const existingIdx = db.favorites.findIndex((f) => f.user_id === uId && f.tmdb_id === tmdbId && f.media_type === mediaType);
    const item = {
      id: existingIdx >= 0 ? db.favorites[existingIdx].id : db.favorites.length + 1,
      user_id: uId,
      tmdb_id: tmdbId,
      media_type: mediaType,
      title_name: titleName,
      poster,
      added_at: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      db.favorites[existingIdx] = item;
    } else {
      db.favorites.push(item);
    }
    saveFallbackDb(db);
    return { rows: [item] };
  }
  if (/DELETE FROM favorites WHERE user_id = \$1/i.test(cleanSql)) {
    db.favorites = db.favorites.filter((f) => f.user_id !== Number(params[0]));
    saveFallbackDb(db);
    return { rows: [] };
  }

  return { rows: [] };
}

const rawPool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

rawPool.on('error', () => {
  // Silent idle error to prevent uncaught exceptions when PG is offline
});

// Resilient pool wrapper: transparently falls back to local persistent store when PostgreSQL is offline
const originalQuery = rawPool.query.bind(rawPool);
const originalConnect = rawPool.connect.bind(rawPool);

function createMockClient() {
  const mockClient = {
    query: (rawPool as any).query,
    release: () => {},
    on: () => mockClient,
    once: () => mockClient,
    off: () => mockClient,
    emit: () => true,
    removeListener: () => mockClient,
  };
  return mockClient;
}

(rawPool as any).query = async function (sql: any, params?: any, callback?: any): Promise<any> {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (warnedOffline) {
    const sqlText = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
    const sqlParams = Array.isArray(params) ? params : (sql && sql.values ? sql.values : []);
    const fallbackResult = executeFallback(sqlText, sqlParams);
    if (callback) callback(null, fallbackResult);
    return fallbackResult;
  }

  try {
    const result = await originalQuery(sql, params);
    if (callback) callback(null, result);
    return result;
  } catch (err: any) {
    const isConnectionError =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('connect ECONNREFUSED') ||
      err.message?.includes('Connection terminated');

    if (isConnectionError) {
      if (!warnedOffline) {
        console.warn('[DB] PostgreSQL is offline. Seamlessly utilizing persistent local fallback database:', fallbackDbPath);
        warnedOffline = true;
      }
      const sqlText = typeof sql === 'string' ? sql : (sql && sql.text ? sql.text : '');
      const sqlParams = Array.isArray(params) ? params : (sql && sql.values ? sql.values : []);
      const fallbackResult = executeFallback(sqlText, sqlParams);
      if (callback) callback(null, fallbackResult);
      return fallbackResult;
    }
    if (callback) callback(err);
    throw err;
  }
};

(rawPool as any).connect = async function (callback?: any): Promise<any> {
  if (warnedOffline) {
    const mockClient = createMockClient();
    if (callback) callback(null, mockClient);
    return mockClient;
  }

  try {
    const client = await originalConnect();
    if (callback) callback(null, client);
    return client;
  } catch (err: any) {
    const isConnectionError =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('connect ECONNREFUSED') ||
      err.message?.includes('Connection terminated');

    if (isConnectionError) {
      if (!warnedOffline) {
        console.warn('[DB] PostgreSQL is offline. Seamlessly utilizing persistent local fallback database for client connection:', fallbackDbPath);
        warnedOffline = true;
      }
      const mockClient = createMockClient();
      if (callback) callback(null, mockClient);
      return mockClient;
    }
    if (callback) callback(err);
    throw err;
  }
};

export default rawPool;

import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import pool from '../db/pool.js';

let cachedProxyUrl = '';
let cachedAgent: SocksProxyAgent | HttpsProxyAgent<string> | undefined;

export async function getProxyUrl(): Promise<string> {
  try {
    const res = await pool.query("SELECT value FROM app_settings WHERE key = 'tmdb_proxy_url'");
    if (res.rows.length > 0 && res.rows[0].value) {
      return (res.rows[0].value as string).trim();
    }
  } catch {}
  return (process.env.TMDB_PROXY_URL || '').trim();
}

export async function getProxyAgent(): Promise<SocksProxyAgent | HttpsProxyAgent<string> | undefined> {
  const proxyUrl = await getProxyUrl();
  if (!proxyUrl) {
    cachedProxyUrl = '';
    cachedAgent = undefined;
    return undefined;
  }

  if (proxyUrl === cachedProxyUrl && cachedAgent) {
    return cachedAgent;
  }

  cachedProxyUrl = proxyUrl;
  try {
    if (proxyUrl.startsWith('socks')) {
      cachedAgent = new SocksProxyAgent(proxyUrl);
    } else {
      cachedAgent = new HttpsProxyAgent(proxyUrl);
    }
    return cachedAgent;
  } catch (err: any) {
    console.error('[TelegramService] Error creating proxy agent:', err.message);
    cachedAgent = undefined;
    return undefined;
  }
}

export interface UserTelegramConfig {
  botToken: string;
  chatId: string;
}

export async function getUserTelegramConfig(userId: number): Promise<UserTelegramConfig | null> {
  try {
    const res = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
    let botToken = '';
    let chatId = '';
    if (res.rows.length > 0) {
      const prefs = res.rows[0].preferences || {};
      botToken = (prefs.telegram_bot_token || prefs.telegramBotToken || '').trim();
      chatId = (prefs.telegram_chat_id || prefs.telegramChatId || '').trim();
    }

    // If user has no direct chatId, check admin allowed_chats if mapped to this userId
    if (!chatId) {
      try {
        const allPrefsRes = await pool.query('SELECT preferences FROM user_preferences');
        for (const pRow of allPrefsRes.rows) {
          const p = pRow.preferences || {};
          const allowed = Array.isArray(p.telegram_allowed_chats) ? p.telegram_allowed_chats : [];
          for (const item of allowed) {
            if (item && typeof item === 'object') {
              if (Number(item.userId) === Number(userId) && item.chatId) {
                chatId = String(item.chatId).trim();
                break;
              }
            }
          }
          if (chatId) break;
        }
      } catch {}
    }

    if (!chatId) return null;

    // If user has no custom bot token, fall back to global admin bot token
    if (!botToken) {
      try {
        const adminRes = await pool.query(
          `SELECT p.preferences FROM user_preferences p 
           JOIN users u ON u.id = p.user_id 
           WHERE p.preferences->>'telegram_bot_token' IS NOT NULL AND p.preferences->>'telegram_bot_token' != '' 
           ORDER BY (u.role = 'admin') DESC, u.id ASC LIMIT 1`
        );
        if (adminRes.rows.length > 0) {
          const p = adminRes.rows[0].preferences || {};
          botToken = (p.telegram_bot_token || p.telegramBotToken || '').trim();
        }
      } catch {}
    }

    if (botToken && chatId) {
      return { botToken, chatId };
    }
  } catch (err: any) {
    console.warn(`[TelegramService] Could not get telegram config for user ${userId}:`, err.message);
  }
  return null;
}

export async function sendTelegramApi(
  botToken: string,
  method: string,
  body: Record<string, any>
): Promise<any> {
  const agent = await getProxyAgent();
  const url = `https://api.telegram.org/bot${botToken}/${method}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    agent: agent as any,
    timeout: 15000,
  });

  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
  }
  return data.result;
}

export async function sendTelegramMessage(
  userId: number,
  text: string,
  replyMarkup?: any,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  const config = await getUserTelegramConfig(userId);
  if (!config) return false;

  try {
    await sendTelegramApi(config.botToken, 'sendMessage', {
      chat_id: config.chatId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup,
      disable_web_page_preview: false,
    });
    return true;
  } catch (err: any) {
    console.warn(`[TelegramService] Failed to send message to user ${userId}:`, err.message);
    return false;
  }
}

export async function sendTelegramPhoto(
  userId: number,
  photoUrl: string,
  caption: string,
  replyMarkup?: any,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<boolean> {
  const config = await getUserTelegramConfig(userId);
  if (!config) return false;

  try {
    if (photoUrl && photoUrl.startsWith('http')) {
      await sendTelegramApi(config.botToken, 'sendPhoto', {
        chat_id: config.chatId,
        photo: photoUrl,
        caption,
        parse_mode: parseMode,
        reply_markup: replyMarkup,
      });
      return true;
    }
  } catch (err: any) {
    console.warn(`[TelegramService] Failed to send photo, falling back to text:`, err.message);
  }

  // Fallback to text message if photo fails
  return sendTelegramMessage(userId, caption, replyMarkup, parseMode);
}

export async function notifyNewEpisode(
  userId: number,
  seriesTitle: string,
  season: number,
  episode: number,
  posterUrl?: string,
  actionData?: any
): Promise<boolean> {
  const epText = episode > 0 && season > 0
    ? `<b>${episode} серия ${season} сезона</b>`
    : episode > 0
    ? `<b>${episode} выпуск/серия</b>`
    : `<b>Новый сезон/серии!</b>`;

  const text = `🔔 <b>Новая серия в Lumière!</b>\n\n` +
    `🎬 <b>${seriesTitle}</b>\n` +
    `✨ ${epText}\n\n` +
    `<i>Релиз уже доступен на торрентах и готов к просмотру.</i>`;

  const inlineKeyboard: any[][] = [];
  if (actionData && actionData.seriesId) {
    inlineKeyboard.push([
      {
        text: '▶ Включить на ТВ',
        callback_data: `tv_play:tv:${actionData.seriesId}:${season}:${episode}`,
      },
      {
        text: '📥 Скачать на сервер',
        callback_data: `dl_server:tv:${actionData.seriesId}:${season}:${episode}`,
      },
    ]);
  }

  const replyMarkup = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined;
  return sendTelegramPhoto(userId, posterUrl || '', text, replyMarkup);
}

export async function notifyDownloadStarted(
  userId: number,
  title: string,
  sizeEstimate?: string
): Promise<boolean> {
  const sizeText = sizeEstimate ? ` (~${sizeEstimate})` : '';
  const text = `⏳ <b>Загрузка начата на сервере</b>\n\n` +
    `📁 <b>${title}</b>${sizeText}\n` +
    `🚀 Файл скачивается в фоновом режиме на сервер Lumière. После завершения вы получите уведомление с возможностью сразу включить на ТВ или удалить.`;
  return sendTelegramMessage(userId, text);
}

export async function notifyDownloadFinished(
  userId: number,
  downloadId: string,
  title: string,
  sizeFormatted: string,
  posterUrl?: string
): Promise<boolean> {
  const text = `✅ <b>Загрузка завершена!</b>\n\n` +
    `🎬 <b>${title}</b>\n` +
    `💾 Размер: <b>${sizeFormatted}</b>\n` +
    `📍 Сохранено на сервере. Доступно для мгновенного офлайн-просмотра без буферизации!`;

  const webBaseUrl = (process.env.WEB_URL || 'https://lumiere.artrax.net').replace(/\/+$/, '');
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '▶ Включить на ТВ',
          callback_data: `tv_play_local:${downloadId}`,
        },
        {
          text: '⬇️ Скачать на устройство',
          url: `${webBaseUrl}/api/downloads/server/download-file/${downloadId}`,
        },
      ],
      [
        {
          text: '🗑 Удалить с сервера',
          callback_data: `dl_delete:${downloadId}`,
        },
      ],
    ],
  };

  return sendTelegramPhoto(userId, posterUrl || '', text, replyMarkup);
}

export async function notifyDownloadDeleted(
  userId: number,
  title: string,
  freedSpace: string,
  totalFreeSpace: string
): Promise<boolean> {
  const text = `🗑 <b>Файл удален с сервера</b>\n\n` +
    `📁 <b>${title}</b>\n` +
    `✨ Освобождено места: <b>${freedSpace}</b>\n` +
    `📊 Свободно на диске сервера: <b>${totalFreeSpace}</b>`;
  return sendTelegramMessage(userId, text);
}

export async function testTelegramConnection(botToken: string, chatId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const agent = await getProxyAgent();
    const getMeUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const meRes = await fetch(getMeUrl, { agent: agent as any, timeout: 10000 });
    const meData = (await meRes.json()) as any;

    if (!meData.ok) {
      return { ok: false, message: `Ошибка токена бота: ${meData.description || 'Неверный токен'}` };
    }

    const botName = meData.result?.first_name || 'Бот';
    const botUser = meData.result?.username ? `@${meData.result.username}` : '';

    const sendUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✨ <b>Lumière Companion подключен!</b>\n\nБот <b>${botName}</b> (${botUser}) успешно привязан к вашему профилю в Lumière.\nТеперь вы будете получать уведомления о новых сериях, статусе загрузок и сможете управлять воспроизведением.`,
        parse_mode: 'HTML',
      }),
      agent: agent as any,
      timeout: 10000,
    });

    const sendData = (await sendRes.json()) as any;
    if (!sendData.ok) {
      return { ok: false, message: `Бот найден (${botName}), но не смог отправить сообщение в чат ${chatId}: ${sendData.description}` };
    }

    return { ok: true, message: `Бот ${botName} (${botUser}) успешно проверен! Проверьте сообщение в Telegram.` };
  } catch (err: any) {
    return { ok: false, message: `Ошибка сети/прокси при подключении к Telegram: ${err.message}` };
  }
}

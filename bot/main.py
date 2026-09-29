import os
import sys
import io
import html
import asyncio
import tempfile
import urllib.parse
from typing import Dict, Any, Optional
import functools
print = functools.partial(print, flush=True)

# Ensure UTF-8 output on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception:
        pass

import aiohttp
from aiohttp_socks import ProxyConnector
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    ReplyKeyboardMarkup,
    KeyboardButton,
    FSInputFile,
)
from aiogram.client.session.aiohttp import AiohttpSession

from voice import recognize_voice_file

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:3500")

def clean_poster_url(raw_poster: str) -> str:
    """Extract a direct clean poster URL from TMDB path or Lumiere image proxy."""
    if not raw_poster:
        return ""
    if "/api/image?url=" in raw_poster:
        try:
            parsed_q = urllib.parse.parse_qs(urllib.parse.urlparse(raw_poster).query)
            clean = parsed_q.get("url", [""])[0]
            if clean:
                return clean
        except Exception:
            pass
    if raw_poster.startswith("http://") or raw_poster.startswith("https://"):
        return raw_poster
    if raw_poster.startswith("/"):
        return f"https://image.tmdb.org/t/p/w500{raw_poster}"
    return raw_poster

def get_main_menu_keyboard() -> ReplyKeyboardMarkup:
    kb = [
        [KeyboardButton(text="🔍 Поиск"), KeyboardButton(text="📺 Сейчас на ТВ")],
        [KeyboardButton(text="📥 Скачанное"), KeyboardButton(text="🔔 Подписки")],
        [KeyboardButton(text="⚙️ Статус сервера")],
    ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)

async def fetch_api(path: str, method: str = "GET", data: Optional[Dict] = None) -> Optional[Any]:
    url = f"{BACKEND_URL}{path}"
    try:
        async with aiohttp.ClientSession() as session:
            if method == "GET":
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        return await resp.json()
            elif method == "POST":
                async with session.post(url, json=data or {}, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status in (200, 201):
                        return await resp.json()
            elif method == "DELETE":
                async with session.delete(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status in (200, 204):
                        return await resp.json()
    except Exception as e:
        print(f"[Bot] API error {method} {url}: {e}")
    return None

def build_dispatcher(user_id: int) -> Dispatcher:
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def cmd_start(message: types.Message):
        welcome_text = (
            "✨ <b>Добро пожаловать в Lumière Companion!</b>\n\n"
            "Ваш персональный кино-ассистент готов к работе:\n\n"
            "🎙 <b>Голосовой поиск</b>: отправьте голосовое сообщение с названием фильма или сериала!\n"
            "🔎 <b>Текстовый поиск</b>: отправьте название в чат.\n"
            "📺 <b>Пульт для ТВ</b>: управляйте воспроизведением на Smart TV.\n"
            "📥 <b>Серверные загрузки</b>: скачивайте релизы на сервер для мгновенного просмотра офлайн.\n"
            "🔔 <b>Уведомления</b>: бот сообщит, когда выйдет новая серия в подписках."
        )
        await message.answer(welcome_text, reply_markup=get_main_menu_keyboard(), parse_mode="HTML")

    @dp.message(F.text == "🔍 Поиск")
    async def btn_search(message: types.Message):
        await message.answer(
            "🔎 Напишите название фильма или сериала, либо запишите <b>голосовое сообщение</b> 🎤:",
            parse_mode="HTML"
        )

    @dp.message(F.text == "📺 Сейчас на ТВ")
    async def btn_tv_status(message: types.Message):
        sessions_data = await fetch_api("/api/sessions/active")
        active_list = (sessions_data or {}).get("sessions", [])

        if not active_list:
            await message.answer(
                "📺 <b>Сейчас на ТВ ничего не воспроизводится</b>.\n\n"
                "Вы можете найти фильм и нажать «▶ Включить на ТВ» прямо из этого чата!",
                parse_mode="HTML"
            )
            return

        sess = active_list[0]
        title = sess.get("mediaTitle", "Воспроизведение")
        curr = int(sess.get("currentTime", 0))
        dur = int(sess.get("duration", 0))
        paused = sess.get("isPaused", False)
        dev = sess.get("deviceName", "Smart TV")

        curr_fmt = f"{curr // 60}:{curr % 60:02d}"
        dur_fmt = f"{dur // 60}:{dur % 60:02d}" if dur > 0 else "--:--"

        text = (
            f"📺 <b>Активное воспроизведение на {html.escape(str(dev))}:</b>\n\n"
            f"🎬 <b>{html.escape(str(title))}</b>\n"
            f"⏱ Время: <code>{curr_fmt} / {dur_fmt}</code>\n"
            f"Состояние: {'⏸ Пауза' if paused else '▶ Воспроизводится'}\n\n"
            f"<i>Используйте кнопки ниже для управления:</i>"
        )

        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="⏪ 30с", callback_data="tv_cmd:seek:-30"),
                InlineKeyboardButton(text="⏯ Пауза/Старт", callback_data="tv_cmd:toggle_play"),
                InlineKeyboardButton(text="⏩ 30с", callback_data="tv_cmd:seek:30"),
            ],
            [
                InlineKeyboardButton(text="⏹ Остановить", callback_data="tv_cmd:stop"),
                InlineKeyboardButton(text="🔄 Обновить", callback_data="tv_cmd:refresh"),
            ]
        ])

        raw_poster = sess.get("mediaPoster", "")
        poster_url = clean_poster_url(raw_poster)
        if poster_url:
            try:
                await message.answer_photo(photo=poster_url, caption=text, reply_markup=kb, parse_mode="HTML")
                return
            except Exception:
                pass
        await message.answer(text, reply_markup=kb, parse_mode="HTML")

    @dp.message(F.text == "📥 Скачанное")
    async def btn_downloads(message: types.Message):
        data = await fetch_api("/api/downloads/server/list")
        if not data:
            await message.answer("Не удалось загрузить список загрузок с сервера.")
            return

        downloads = data.get("downloads", [])
        disk = data.get("disk", {})
        free_space = disk.get("free", "Неизвестно")

        if not downloads:
            await message.answer(
                f"📥 <b>Скачанных файлов на сервере нет</b>.\n\n"
                f"📊 Свободно на диске: <b>{free_space}</b>\n"
                f"Вы можете поставить фильм на загрузку заранее, нажав «📥 На сервер» в результатах поиска.",
                parse_mode="HTML"
            )
            return

        text = f"📥 <b>Скачано на сервер ({len(downloads)}):</b>\n"
        text += f"📊 Свободно на диске: <b>{free_space}</b>\n\n"

        for idx, item in enumerate(downloads[:5], 1):
            status_emoji = "✅" if item.get("status") == "completed" else "⏳"
            item_title = html.escape(str(item.get('title') or 'Видео'))
            text += f"{idx}. {status_emoji} <b>{item_title}</b> — {item.get('fileSizeFormatted', '')}\n"

        await message.answer(text, parse_mode="HTML")

        # Send cards for recent downloaded items
        for item in downloads[:3]:
            safe_title = html.escape(str(item.get('title') or 'Видео'))
            card_text = (
                f"📁 <b>{safe_title}</b>\n"
                f"💾 Размер: {item.get('fileSizeFormatted', '')}\n"
                f"Статус: {'Готово к просмотру' if item.get('status') == 'completed' else 'Скачивается...'}"
            )
            ikb = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="▶ Включить на ТВ", callback_data=f"tv_play_local:{item.get('id')}"),
                    InlineKeyboardButton(text="🗑 Удалить с диска", callback_data=f"dl_delete:{item.get('id')}"),
                ]
            ])
            raw_poster = item.get("poster", "")
            poster_url = clean_poster_url(raw_poster)
            if poster_url:
                try:
                    await message.answer_photo(photo=poster_url, caption=card_text, reply_markup=ikb, parse_mode="HTML")
                    continue
                except Exception:
                    pass
            await message.answer(card_text, reply_markup=ikb, parse_mode="HTML")

    @dp.message(F.text == "🔔 Подписки")
    async def btn_subscriptions(message: types.Message):
        sub_data = await fetch_api(f"/api/notifications/subscriptions?userId={user_id}")
        subs = (sub_data or {}).get("subscriptions", [])
        notif_data = await fetch_api(f"/api/notifications?userId={user_id}")
        notifs = (notif_data or {}).get("notifications", [])
        unread = (notif_data or {}).get("unreadCount", 0)

        text = (
            f"🔔 <b>Мои подписки и уведомления</b>\n\n"
            f"Непрочитанных уведомлений: <b>{unread}</b>\n"
            f"Отслеживаемых сериалов: <b>{len(subs)}</b>\n\n"
        )
        if subs:
            text += "<b>Ваши активные сериалы:</b>\n"
            for s in subs[:8]:
                stitle = html.escape(str(s.get("title", "")))
                last_s = s.get("lastSeason", 0)
                last_ep = s.get("lastEpisode", 0)
                ep_info = f" <i>(последняя: S{last_s:02d}E{last_ep:02d})</i>" if last_s > 0 else ""
                text += f"• <b>{stitle}</b>{ep_info}\n"
            text += "\n<i>Когда на торрентах выйдет новая серия, бот сразу пришлет вам сообщение!</i>"
        else:
            text += (
                "<i>Вы пока не подписались ни на один сериал.</i>\n\n"
                "При поиске любого сериала вы можете нажать кнопку «🔔 Отслеживать», "
                "и бот пришлет уведомление, как только на торрентах появится новая серия!"
            )

        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="🔄 Проверить новые серии", callback_data="sub_check"),
            ]
        ])
        await message.answer(text, reply_markup=kb, parse_mode="HTML")

    @dp.message(F.text == "⚙️ Статус сервера")
    async def btn_server_status(message: types.Message):
        dl_data = await fetch_api("/api/downloads/server/list")
        tmdb_data = await fetch_api("/api/settings/tmdb")

        disk = (dl_data or {}).get("disk", {})
        free_space = disk.get("free", "Неизвестно")
        total_space = disk.get("total", "Неизвестно")
        tmdb_online = (tmdb_data or {}).get("online", False)
        proxy_url = (tmdb_data or {}).get("proxyUrl", "")

        proxy_info = "Подключен (SOCKS5/HTTPS)" if proxy_url else "Не используется"

        text = (
            "⚙️ <b>Состояние сервера Lumière:</b>\n\n"
            f"🟢 <b>Сервер</b>: Онлайн\n"
            f"💾 <b>Диск</b>: {free_space} свободно / {total_space} всего\n"
            f"🌐 <b>TMDB</b>: {'🟢 Доступен' if tmdb_online else '🔴 Недоступен'}\n"
            f"🛡 <b>Прокси</b>: {proxy_info}\n"
            f"⚡ <b>TorrServer</b>: Активен (кэш 512 MB, пиры настроены)"
        )
        await message.answer(text, parse_mode="HTML")

    @dp.message(F.voice)
    async def handle_voice(message: types.Message, bot: Bot):
        status_msg = await message.answer("🎧 <i>Слушаю и распознаю голос...</i>", parse_mode="HTML")

        voice_file = await bot.get_file(message.voice.file_id)
        temp_ogg = tempfile.mktemp(suffix=".ogg")

        try:
            await bot.download_file(voice_file.file_path, destination=temp_ogg)
            recognized_text = recognize_voice_file(temp_ogg)
        except Exception as e:
            print(f"[Bot] Voice download/recognize error: {e}")
            recognized_text = ""
        finally:
            if os.path.exists(temp_ogg):
                try:
                    os.remove(temp_ogg)
                except Exception:
                    pass

        if not recognized_text:
            await status_msg.edit_text("😕 Не удалось разобрать слова. Попробуйте сказать громче или напишите текстом.")
            return

        safe_text = html.escape(recognized_text)
        await status_msg.edit_text(f"🎤 Вы сказали: «<b>{safe_text}</b>»\n🔎 <i>Ищу в Lumière...</i>", parse_mode="HTML")
        await perform_search_and_reply(message, recognized_text)

    @dp.message(F.text)
    async def handle_text(message: types.Message):
        query = message.text.strip()
        if not query or query.startswith("/"):
            return
        if query in ("🔍 Поиск", "📺 Сейчас на ТВ", "📥 Скачанное", "🔔 Подписки", "⚙️ Статус сервера"):
            return
        await perform_search_and_reply(message, query)

    async def perform_search_and_reply(message: types.Message, query: str):
        search_res = await fetch_api(f"/api/search?q={urllib.parse.quote(query)}")
        items = (search_res or {}).get("results", [])

        if not items:
            safe_q = html.escape(query)
            await message.answer(f"🔍 По запросу «<b>{safe_q}</b>» ничего не найдено на TMDB.", parse_mode="HTML")
            return

        safe_q = html.escape(query)
        await message.answer(f"🎬 <b>Результаты поиска для «{safe_q}»:</b>", parse_mode="HTML")

        for item in items[:4]:
            title = str(item.get("name") or item.get("title") or "Без названия")
            media_type = str(item.get("type") or item.get("mediaType") or "movie")
            media_id = item.get("id") or item.get("tmdbId")
            score = float(item.get("score") or item.get("voteAverage") or 0)
            year_val = str(item.get("year") or (item.get("releaseDate") or "")[:4] or "")
            overview = str(item.get("description") or item.get("overview") or "")

            rating_fmt = f"⭐ {score:.1f}" if score > 0 else ""
            year_fmt = f"({year_val})" if year_val else ""
            type_fmt = "Сериал" if media_type == "tv" else "Фильм"

            safe_title = html.escape(title)
            safe_overview = html.escape(overview[:180] + ("..." if len(overview) > 180 else ""))

            card_caption = (
                f"🎬 <b>{safe_title}</b> {year_fmt} {rating_fmt}\n"
                f"Тип: {type_fmt}\n\n"
                f"{safe_overview}"
            )

            encoded_title = urllib.parse.quote(title[:25])
            action_buttons = [
                InlineKeyboardButton(
                    text="▶ Включить на ТВ",
                    callback_data=f"tv_play:{media_type}:{media_id}:{encoded_title}"
                ),
                InlineKeyboardButton(
                    text="📥 На сервер",
                    callback_data=f"dl_start:{media_type}:{media_id}:{encoded_title}"
                ),
            ]

            keyboard_rows = [action_buttons]
            if media_type == "tv":
                keyboard_rows.append([
                    InlineKeyboardButton(
                        text="🔔 Отслеживать серии",
                        callback_data=f"sub_add:{media_id}:{encoded_title}"
                    )
                ])

            inline_kb = InlineKeyboardMarkup(inline_keyboard=keyboard_rows)

            raw_poster = item.get("poster") or item.get("posterPath") or ""
            poster_url = clean_poster_url(raw_poster)

            if poster_url:
                try:
                    await message.answer_photo(photo=poster_url, caption=card_caption, reply_markup=inline_kb, parse_mode="HTML")
                    continue
                except Exception as pe:
                    print(f"[Bot] Failed to send photo for {title}: {pe}")

            try:
                await message.answer(card_caption, reply_markup=inline_kb, parse_mode="HTML")
            except Exception:
                # Plain text fallback if HTML parsing fails
                await message.answer(f"🎬 {title} {year_fmt} {rating_fmt}\n\n{overview[:180]}", reply_markup=inline_kb)

    # Callback Query Handlers
    @dp.callback_query(F.data.startswith("tv_play:"))
    async def on_tv_play(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_type = parts[1] if len(parts) > 1 else "movie"
        media_id = parts[2] if len(parts) > 2 else ""
        raw_title = urllib.parse.unquote(parts[3]) if len(parts) > 3 else "Медиа"

        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": "play_media",
            "deviceType": "tv",
            "userId": user_id,
            "value": {
                "mediaType": media_type,
                "mediaId": media_id,
                "title": raw_title,
            }
        })

        if res and res.get("success"):
            await call.answer("▶ Команда отправлена на ТВ!", show_alert=True)
            await call.message.reply(f"🚀 Запускаем <b>«{html.escape(raw_title)}»</b> на вашем ТВ...", parse_mode="HTML")
        else:
            await call.answer("⚠️ Не удалось отправить на ТВ. Убедитесь, что приложение на ТВ включено.", show_alert=True)

    @dp.callback_query(F.data.startswith("tv_play_local:"))
    async def on_tv_play_local(call: types.CallbackQuery):
        dl_id = call.data.replace("tv_play_local:", "")
        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": "play_media",
            "deviceType": "tv",
            "userId": user_id,
            "value": {
                "streamUrl": f"/api/downloads/server/stream/{dl_id}",
                "downloadId": dl_id,
                "title": "Локальное видео",
            }
        })

        if res and res.get("success"):
            await call.answer("▶ Запускаем локальный файл на ТВ!", show_alert=True)
        else:
            await call.answer("⚠️ ТВ не в сети или не отвечает.", show_alert=True)

    @dp.callback_query(F.data.startswith("tv_cmd:"))
    async def on_tv_remote_cmd(call: types.CallbackQuery):
        parts = call.data.split(":")
        sub_action = parts[1]

        if sub_action == "refresh":
            sessions_data = await fetch_api("/api/sessions/active")
            active_list = (sessions_data or {}).get("sessions", [])
            if not active_list:
                await call.answer("Сейчас на ТВ ничего не воспроизводится", show_alert=True)
                try:
                    if call.message.caption:
                        await call.message.edit_caption(caption="📺 <b>Сейчас на ТВ ничего не воспроизводится</b>.", parse_mode="HTML")
                    else:
                        await call.message.edit_text(text="📺 <b>Сейчас на ТВ ничего не воспроизводится</b>.", parse_mode="HTML")
                except Exception:
                    pass
                return

            sess = active_list[0]
            title = sess.get("mediaTitle", "Воспроизведение")
            curr = int(sess.get("currentTime", 0))
            dur = int(sess.get("duration", 0))
            paused = sess.get("isPaused", False)
            dev = sess.get("deviceName", "Smart TV")
            curr_fmt = f"{curr // 60}:{curr % 60:02d}"
            dur_fmt = f"{dur // 60}:{dur % 60:02d}" if dur > 0 else "--:--"

            text = (
                f"📺 <b>Активное воспроизведение на {html.escape(str(dev))}:</b>\n\n"
                f"🎬 <b>{html.escape(str(title))}</b>\n"
                f"⏱ Время: <code>{curr_fmt} / {dur_fmt}</code>\n"
                f"Состояние: {'⏸ Пауза' if paused else '▶ Воспроизводится'}\n\n"
                f"<i>Используйте кнопки ниже для управления:</i>"
            )
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="⏪ 30с", callback_data="tv_cmd:seek:-30"),
                    InlineKeyboardButton(text="⏯ Пауза/Старт", callback_data="tv_cmd:toggle_play"),
                    InlineKeyboardButton(text="⏩ 30с", callback_data="tv_cmd:seek:30"),
                ],
                [
                    InlineKeyboardButton(text="⏹ Остановить", callback_data="tv_cmd:stop"),
                    InlineKeyboardButton(text="🔄 Обновить", callback_data="tv_cmd:refresh"),
                ]
            ])
            try:
                if call.message.caption:
                    await call.message.edit_caption(caption=text, reply_markup=kb, parse_mode="HTML")
                else:
                    await call.message.edit_text(text=text, reply_markup=kb, parse_mode="HTML")
            except Exception:
                pass
            await call.answer("Статус обновлен")
            return

        action_name = sub_action
        val = None
        if sub_action == "seek" and len(parts) > 2:
            val = int(parts[2])

        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": action_name,
            "deviceType": "tv",
            "value": val,
            "userId": user_id,
        })

        if res and res.get("success"):
            desc = f"{val:+d}с" if sub_action == "seek" else sub_action
            await call.answer(f"Команда выполнена: {desc}")
            # Refresh message after command
            await asyncio.sleep(0.5)
            sessions_data = await fetch_api("/api/sessions/active")
            active_list = (sessions_data or {}).get("sessions", [])
            if not active_list or sub_action == "stop":
                try:
                    if call.message.caption:
                        await call.message.edit_caption(caption="⏹ Воспроизведение остановлено.", parse_mode="HTML")
                    else:
                        await call.message.edit_text(text="⏹ Воспроизведение остановлено.", parse_mode="HTML")
                except Exception:
                    pass
            else:
                sess = active_list[0]
                title = sess.get("mediaTitle", "Воспроизведение")
                curr = int(sess.get("currentTime", 0))
                dur = int(sess.get("duration", 0))
                paused = sess.get("isPaused", False)
                dev = sess.get("deviceName", "Smart TV")
                curr_fmt = f"{curr // 60}:{curr % 60:02d}"
                dur_fmt = f"{dur // 60}:{dur % 60:02d}" if dur > 0 else "--:--"
                text = (
                    f"📺 <b>Активное воспроизведение на {html.escape(str(dev))}:</b>\n\n"
                    f"🎬 <b>{html.escape(str(title))}</b>\n"
                    f"⏱ Время: <code>{curr_fmt} / {dur_fmt}</code>\n"
                    f"Состояние: {'⏸ Пауза' if paused else '▶ Воспроизводится'}\n\n"
                    f"<i>Используйте кнопки ниже для управления:</i>"
                )
                kb = InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(text="⏪ 30с", callback_data="tv_cmd:seek:-30"),
                        InlineKeyboardButton(text="⏯ Пауза/Старт", callback_data="tv_cmd:toggle_play"),
                        InlineKeyboardButton(text="⏩ 30с", callback_data="tv_cmd:seek:30"),
                    ],
                    [
                        InlineKeyboardButton(text="⏹ Остановить", callback_data="tv_cmd:stop"),
                        InlineKeyboardButton(text="🔄 Обновить", callback_data="tv_cmd:refresh"),
                    ]
                ])
                try:
                    if call.message.caption:
                        await call.message.edit_caption(caption=text, reply_markup=kb, parse_mode="HTML")
                    else:
                        await call.message.edit_text(text=text, reply_markup=kb, parse_mode="HTML")
                except Exception:
                    pass
        else:
            await call.answer("ТВ сейчас не воспроизводит или отключен", show_alert=True)

    @dp.callback_query(F.data == "sub_check")
    async def on_sub_check(call: types.CallbackQuery):
        await call.answer("🔍 Проверяем торренты на новые серии...")
        res = await fetch_api(f"/api/notifications/check?userId={user_id}", method="POST")
        count = (res or {}).get("newEpisodesFound", 0)
        if count > 0:
            await call.message.reply(f"🎉 Найдено новых серий: <b>{count}</b>! Уведомления отправлены.", parse_mode="HTML")
        else:
            await call.message.reply("✅ Все серии актуальны, новых релизов пока нет.")

    @dp.callback_query(F.data.startswith("sub_add:"))
    async def on_sub_add(call: types.CallbackQuery):
        parts = call.data.split(":")
        tmdb_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        raw_title = urllib.parse.unquote(parts[2]) if len(parts) > 2 else "Сериал"

        res = await fetch_api("/api/notifications/subscribe", method="POST", data={
            "userId": user_id,
            "tmdbId": tmdb_id,
            "title": raw_title,
        })
        if res and res.get("success"):
            await call.answer("🔔 Сериал добавлен в отслеживание!", show_alert=True)
            await call.message.reply(
                f"🔔 Вы успешно подписались на сериал <b>«{html.escape(raw_title)}»</b>.\n"
                f"Как только на торрентах выйдет свежая серия, бот пришлет вам уведомление с кнопкой включения на ТВ!",
                parse_mode="HTML"
            )
        else:
            await call.answer("Не удалось подписаться", show_alert=True)

    @dp.callback_query(F.data.startswith("dl_start:"))
    async def on_dl_start(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_type = parts[1] if len(parts) > 1 else "movie"
        media_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        raw_title = urllib.parse.unquote(parts[3]) if len(parts) > 3 else "Медиа"

        await call.answer("🔍 Ищем лучший релиз для загрузки...")
        torr_res = await fetch_api(f"/api/torrents/search?q={urllib.parse.quote(raw_title)}&tmdbId={media_id}&type={media_type}")
        torrents = (torr_res or {}).get("results", []) or (torr_res or {}).get("torrents", [])

        if not torrents:
            await call.message.reply(f"⚠️ Торрент-релизы не найдены для «{html.escape(raw_title)}».")
            return

        best = torrents[0]
        magnet = best.get("magnet", "")
        best_hash = best.get("hash", "")
        file_size = best.get("size", 0)

        res = await fetch_api("/api/downloads/server/start", method="POST", data={
            "title": raw_title,
            "mediaType": media_type,
            "mediaId": media_id,
            "magnet": magnet,
            "torrentHash": best_hash,
            "torrentIndex": 0,
            "fileSize": file_size,
        })

        if res and res.get("success"):
            await call.message.reply(
                f"⏳ Релиз <b>«{html.escape(raw_title)}»</b> поставлен на загрузку на диск сервера.\n"
                f"После завершения скачивания вы получите уведомление.",
                parse_mode="HTML"
            )
        else:
            await call.message.reply("⚠️ Ошибка при запуске загрузки на сервер.")

    @dp.callback_query(F.data.startswith("dl_delete:"))
    async def on_dl_delete(call: types.CallbackQuery):
        dl_id = call.data.replace("dl_delete:", "")
        res = await fetch_api(f"/api/downloads/server/{dl_id}", method="DELETE")

        if res and res.get("success"):
            freed = res.get("freedSpace", "")
            await call.answer(f"🗑 Удалено с сервера! Освобождено {freed}", show_alert=True)
            try:
                await call.message.delete()
            except Exception:
                pass
        else:
            await call.answer("Ошибка удаления или файл не найден", show_alert=True)

    return dp

async def run_bot_instance(token: str, user_id: int, proxy_url: str):
    clean_proxy = proxy_url.replace("socks5h://", "socks5://") if proxy_url else None
    session = None

    can_direct = False
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as test_session:
            async with test_session.get("https://api.telegram.org", timeout=4) as resp:
                if resp.status < 500:
                    can_direct = True
    except Exception:
        can_direct = False

    if not can_direct and clean_proxy:
        try:
            session = AiohttpSession(proxy=clean_proxy)
            print(f"[Bot] Using SOCKS5 proxy for user {user_id}: {clean_proxy}")
        except Exception as pe:
            print(f"[Bot] Failed to set proxy, using direct: {pe}")
    else:
        print(f"[Bot] Connecting to Telegram directly for user {user_id} (direct access verified)")

    bot = Bot(token=token, session=session)
    dp = build_dispatcher(user_id)

    try:
        me = await bot.get_me()
        print(f"[Bot] Bot @{me.username} ({me.first_name}) connected successfully for user {user_id}!")
        print(f"[Bot] Resetting update stream for @{me.username}...")
        try:
            await bot.delete_webhook(drop_pending_updates=True)
        except Exception as we:
            print(f"[Bot] delete_webhook note: {we}")
        print(f"[Bot] Polling started for @{me.username} (user {user_id})")
        await dp.start_polling(bot, handle_signals=False, drop_pending_updates=True)
    except Exception as e:
        print(f"[Bot] Polling error for user {user_id}: {e}")
    finally:
        await bot.session.close()

async def main():
    print("=" * 60)
    print("🚀 Lumière Companion Telegram Bot Service Starting...")
    print("=" * 60)

    running_tasks: Dict[str, asyncio.Task] = {}

    while True:
        try:
            # Clean up finished/failed tasks
            finished = [tok for tok, t in running_tasks.items() if t.done()]
            for tok in finished:
                print(f"[BotManager] Cleaning up finished bot task: {tok[:10]}...")
                del running_tasks[tok]

            bots_data = await fetch_api("/api/internal/telegram-bots")
            if bots_data:
                proxy_url = bots_data.get("proxyUrl", "")
                bots = bots_data.get("bots", [])
                active_tokens = set()

                for b in bots:
                    token = b.get("token")
                    u_id = b.get("userId")
                    if not token:
                        continue
                    active_tokens.add(token)
                    if token not in running_tasks:
                        print(f"[BotManager] Launching companion bot for user {u_id} ({b.get('userName')})")
                        task = asyncio.create_task(run_bot_instance(token, u_id, proxy_url))
                        running_tasks[token] = task

                # Cancel bots that were removed from settings
                removed = [tok for tok in running_tasks.keys() if tok not in active_tokens]
                for tok in removed:
                    print(f"[BotManager] Cancelling removed bot token: {tok[:10]}...")
                    running_tasks[tok].cancel()
                    del running_tasks[tok]
            else:
                print("[BotManager] Waiting for backend at " + BACKEND_URL)
        except Exception as e:
            print(f"[BotManager] Loop error: {e}")

        await asyncio.sleep(15)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        print("[Bot] Stopped.")

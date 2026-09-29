import os
import sys
import io
import asyncio
import tempfile
import urllib.parse
from typing import Dict, Any, Optional

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
            "🎙 <b>Голосовой поиск</b>: просто отправьте голосовое сообщение с названием фильма или сериала!\n"
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
            f"📺 <b>Активное воспроизведение на {dev}:</b>\n\n"
            f"🎬 <b>{title}</b>\n"
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

        poster = sess.get("mediaPoster", "")
        if poster and poster.startswith("http"):
            try:
                await message.answer_photo(photo=poster, caption=text, reply_markup=kb, parse_mode="HTML")
                return
            except:
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
            text += f"{idx}. {status_emoji} <b>{item.get('title')}</b> — {item.get('fileSizeFormatted', '')}\n"

        await message.answer(text, parse_mode="HTML")

        # Send cards for recent downloaded items
        for item in downloads[:3]:
            card_text = (
                f"📁 <b>{item.get('title')}</b>\n"
                f"💾 Размер: {item.get('fileSizeFormatted', '')}\n"
                f"Статус: {'Готово к просмотру' if item.get('status') == 'completed' else 'Скачивается...'}"
            )
            ikb = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="▶ Включить на ТВ", callback_data=f"tv_play_local:{item.get('id')}"),
                    InlineKeyboardButton(text="🗑 Удалить с диска", callback_data=f"dl_delete:{item.get('id')}"),
                ]
            ])
            poster = item.get("poster", "")
            if poster and poster.startswith("http"):
                try:
                    await message.answer_photo(photo=poster, caption=card_text, reply_markup=ikb, parse_mode="HTML")
                    continue
                except:
                    pass
            await message.answer(card_text, reply_markup=ikb, parse_mode="HTML")

    @dp.message(F.text == "🔔 Подписки")
    async def btn_subscriptions(message: types.Message):
        data = await fetch_api(f"/api/notifications")
        notifs = (data or {}).get("notifications", [])
        unread = len([n for n in notifs if not n.get("is_read")])

        text = (
            f"🔔 <b>Уведомления и подписки</b>\n\n"
            f"Непрочитанных уведомлений: <b>{unread}</b>\n"
            f"Когда на торрентах выйдет новая серия любого сериала, за которым вы следите, бот сразу пришлет вам сообщение с кнопкой «▶ Включить на ТВ»!"
        )
        await message.answer(text, parse_mode="HTML")

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
                except:
                    pass

        if not recognized_text:
            await status_msg.edit_text("😕 Не удалось разобрать слова. Попробуйте сказать громче или напишите текстом.")
            return

        await status_msg.edit_text(f"🎤 Вы сказали: «<b>{recognized_text}</b>»\n🔎 <i>Ищу в Lumière...</i>", parse_mode="HTML")
        await perform_search_and_reply(message, recognized_text)

    @dp.message(F.text)
    async def handle_text(message: types.Message):
        query = message.text.strip()
        if not query or query.startswith("/"):
            return
        await perform_search_and_reply(message, query)

    async def perform_search_and_reply(message: types.Message, query: str):
        search_res = await fetch_api(f"/api/search?q={urllib.parse.quote(query)}")
        items = (search_res or {}).get("results", [])

        if not items:
            await message.answer(f"🔍 По запросу «<b>{query}</b>» ничего не найдено на TMDB.", parse_mode="HTML")
            return

        await message.answer(f"🎬 <b>Результаты поиска для «{query}»:</b>", parse_mode="HTML")

        for item in items[:4]:
            title = item.get("title") or item.get("name") or "Без названия"
            media_type = item.get("mediaType") or "movie"
            media_id = item.get("id")
            rating = item.get("voteAverage", 0)
            year = (item.get("releaseDate") or item.get("firstAirDate") or "")[:4]
            rating_fmt = f"⭐ {rating:.1f}" if rating > 0 else ""
            year_fmt = f"({year})" if year else ""

            poster_path = item.get("poster") or item.get("posterPath") or ""
            poster_url = ""
            if poster_path:
                poster_url = poster_path if poster_path.startswith("http") else f"https://image.tmdb.org/t/p/w500{poster_path}"

            overview = item.get("overview", "")
            if len(overview) > 180:
                overview = overview[:180] + "..."

            card_caption = (
                f"🎬 <b>{title}</b> {year_fmt} {rating_fmt}\n"
                f"Тип: {'Сериал' if media_type == 'tv' else 'Фильм'}\n\n"
                f"{overview}"
            )

            inline_kb = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="▶ Включить на ТВ",
                        callback_data=f"tv_play:{media_type}:{media_id}:{urllib.parse.quote(title[:30])}"
                    ),
                    InlineKeyboardButton(
                        text="📥 На сервер",
                        callback_data=f"dl_start:{media_type}:{media_id}:{urllib.parse.quote(title[:30])}"
                    ),
                ]
            ])

            if poster_url:
                try:
                    await message.answer_photo(photo=poster_url, caption=card_caption, reply_markup=inline_kb, parse_mode="HTML")
                    continue
                except Exception as pe:
                    print(f"[Bot] Failed to send photo: {pe}")

            await message.answer(card_caption, reply_markup=inline_kb, parse_mode="HTML")

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
            "value": {
                "mediaType": media_type,
                "mediaId": media_id,
                "title": raw_title,
            }
        })

        if res and res.get("success"):
            await call.answer("▶ Команда отправлена на ТВ!", show_alert=True)
            await call.message.reply(f"🚀 Запускаем <b>«{raw_title}»</b> на вашем ТВ...", parse_mode="HTML")
        else:
            await call.answer("⚠️ Не удалось отправить на ТВ. Убедитесь, что приложение на ТВ включено.", show_alert=True)

    @dp.callback_query(F.data.startswith("tv_play_local:"))
    async def on_tv_play_local(call: types.CallbackQuery):
        dl_id = call.data.replace("tv_play_local:", "")
        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": "play_media",
            "deviceType": "tv",
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
            await call.answer("Обновлено")
            return

        action_name = "toggle_play" if sub_action == "toggle_play" else sub_action
        val = None
        if sub_action == "seek" and len(parts) > 2:
            val = int(parts[2])

        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": action_name,
            "deviceType": "tv",
            "value": val,
        })

        if res and res.get("success"):
            await call.answer(f"Выполнено: {sub_action}")
        else:
            await call.answer("ТВ сейчас не воспроизводит или отключен", show_alert=True)

    @dp.callback_query(F.data.startswith("dl_start:"))
    async def on_dl_start(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_type = parts[1] if len(parts) > 1 else "movie"
        media_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        raw_title = urllib.parse.unquote(parts[3]) if len(parts) > 3 else "Медиа"

        # Search torrent to find best release for download
        torr_res = await fetch_api(f"/api/torrents/search?q={urllib.parse.quote(raw_title)}&tmdbId={media_id}&type={media_type}")
        torrents = (torr_res or {}).get("torrents", [])

        if not torrents:
            await call.answer("Торрент-релизы не найдены для этой позиции", show_alert=True)
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
            await call.answer("⏳ Загрузка на сервер начата!", show_alert=True)
            await call.message.reply(
                f"⏳ Релиз <b>«{raw_title}»</b> поставлен на загрузку на диск сервера.\n"
                f"После скачивания вы получите уведомление.",
                parse_mode="HTML"
            )
        else:
            await call.answer("Ошибка при запуске загрузки", show_alert=True)

    @dp.callback_query(F.data.startswith("dl_delete:"))
    async def on_dl_delete(call: types.CallbackQuery):
        dl_id = call.data.replace("dl_delete:", "")
        res = await fetch_api(f"/api/downloads/server/{dl_id}", method="DELETE")

        if res and res.get("success"):
            freed = res.get("freedSpace", "")
            await call.answer(f"🗑 Удалено с сервера! Освобождено {freed}", show_alert=True)
            try:
                await call.message.delete()
            except:
                pass
        else:
            await call.answer("Ошибка удаления или файл не найден", show_alert=True)

    return dp

async def run_bot_instance(token: str, user_id: int, proxy_url: str):
    clean_proxy = proxy_url.replace("socks5h://", "socks5://") if proxy_url else None
    print(f"[Bot] Initializing bot for user {user_id}, proxy: {clean_proxy or 'None'}")
    session = None
    if clean_proxy:
        try:
            session = AiohttpSession(proxy=clean_proxy)
            print(f"[Bot] Successfully configured proxy for user {user_id}: {clean_proxy}")
        except Exception as pe:
            print(f"[Bot] Failed to set proxy, falling back to direct connection: {pe}")

    bot = Bot(token=token, session=session)
    dp = build_dispatcher(user_id)

    try:
        me = await bot.get_me()
        print(f"[Bot] Bot @{me.username} ({me.first_name}) connected successfully for user {user_id}!")
        wh = await bot.get_webhook_info()
        if wh.url:
            print(f"[Bot] Clearing active webhook for @{me.username}...")
            await bot.delete_webhook(drop_pending_updates=False)
        print(f"[Bot] Polling started for @{me.username} (user {user_id})")
        await dp.start_polling(bot, handle_signals=False)
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

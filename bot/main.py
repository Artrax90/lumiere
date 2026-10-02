import os
import sys
import io
import html
import asyncio
import random
import uuid
import tempfile
import urllib.parse
from typing import Dict, Any, Optional, Set, Callable, Awaitable
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
from aiogram import Bot, Dispatcher, types, F, BaseMiddleware
from aiogram.filters import CommandStart, Command
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    ReplyKeyboardMarkup,
    KeyboardButton,
    FSInputFile,
    BotCommand,
    MenuButtonCommands,
    TelegramObject,
)
from aiogram.client.session.aiohttp import AiohttpSession

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:3500")
WEB_URL = os.getenv("WEB_URL", "https://lumiere.artrax.net")

# Global registry of allowed chat IDs per bot token: { token: {chat_id, ...} }
BOT_ALLOWED_CHATS: Dict[str, Set[int]] = {}

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

def get_main_menu_inline_keyboard() -> InlineKeyboardMarkup:
    """Modern translucent frosted-glass inline keyboard with Bot API 9.4 styles."""
    buttons = [
        [
            InlineKeyboardButton(text="🔍 Поиск фильмов", callback_data="menu:search", style="primary"),
            InlineKeyboardButton(text="🎲 Кино-рулетка", callback_data="menu:roulette", style="success"),
        ],
        [
            InlineKeyboardButton(text="📺 Сейчас на ТВ", callback_data="menu:tv"),
            InlineKeyboardButton(text="📥 Скачанное", callback_data="menu:downloads"),
        ],
        [
            InlineKeyboardButton(text="🔔 Подписки", callback_data="menu:subs"),
            InlineKeyboardButton(text="⚙️ Статус сервера", callback_data="menu:status"),
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_main_reply_keyboard() -> ReplyKeyboardMarkup:
    """Persistent docked reply keyboard at the bottom of the chat for instant navigation."""
    keyboard = [
        [KeyboardButton(text="🔍 Поиск"), KeyboardButton(text="🎲 Кино-рулетка")],
        [KeyboardButton(text="📺 Сейчас на ТВ"), KeyboardButton(text="📥 Скачанное")],
        [KeyboardButton(text="✨ Главное меню"), KeyboardButton(text="⚙️ Статус")]
    ]
    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder="Название фильма или выберите пункт меню..."
    )

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

import re

ITEM_CACHE: Dict[str, dict] = {}
TORRENT_PICK_CACHE: Dict[str, dict] = {}

def parse_torrent_badge(title: str, size_str: str = "", seeders: int = 0) -> str:
    """Format a concise badge for torrent releases (quality, audio, size, seeders)."""
    t_up = title.upper()

    # 1. Quality / Rip type
    quality = "1080p"
    if "2160P" in t_up or "4K" in t_up or "UHD" in t_up:
        quality = "4K UHD"
    elif "1080P" in t_up:
        quality = "1080p"
    elif "720P" in t_up:
        quality = "720p"
    elif "HDTVRIP" in t_up or "HDTV" in t_up:
        quality = "HDTV"
    elif "BDRIP" in t_up:
        quality = "BDRip"
    elif "DVDRIP" in t_up:
        quality = "DVDRip"
    elif "WEBRIP" in t_up:
        quality = "WEBRip"
    elif "WEB-DL" in t_up:
        quality = "WEB-DL"

    # 2. Audio hint / Translator detection
    audio = ""
    ap_match = re.search(r'\bАП\s*[\(\[]?([А-Яа-яA-Za-z]+)[\)\]]?', title)
    if ap_match and ap_match.group(1).upper() not in ["HD", "AVC", "MKV", "1080P", "720P", "RUS"]:
        audio = f"АП {ap_match.group(1)}"
    elif re.search(r'\b(АП|АВТОРСК)\b', t_up):
        audio = "АП"
    elif "ДУБЛЯЖ" in t_up or "DUB" in t_up:
        audio = "Дубляж"
    elif "ПД" in t_up:
        audio = "ПД"
    elif "DVO" in t_up or "ДВУХГОЛОС" in t_up:
        audio = "DVO"
    elif "MVO" in t_up or "МНОГОГОЛОС" in t_up:
        audio = "MVO"
    elif "AVO" in t_up:
        audio = "AVO"
    elif "LOSTFILM" in t_up:
        audio = "LostFilm"
    elif "HDREZKA" in t_up:
        audio = "HDRezka"
    elif "КУБИК В КУБЕ" in t_up or "КУБИК" in t_up:
        audio = "Кубик"
    elif "СУБТИТР" in t_up or "SUB" in t_up:
        audio = "Субтитры"

    parts = [quality]
    if audio:
        parts.append(audio)
    if size_str:
        parts.append(size_str)
    if seeders is not None:
        if seeders > 0:
            parts.append(f"⬆{seeders}")
        else:
            parts.append("⚠️ 0 сидов")

    return " • ".join(parts)

USER_CHAT_CACHE: Dict[int, dict] = {}

async def resolve_sender_user(event: Any, default_user_id: int) -> dict:
    """Dynamically resolve the isolated Lumiere user corresponding to this Telegram sender."""
    from_user = getattr(event, "from_user", None)
    sender_id = from_user.id if from_user else None
    if not sender_id:
        return {"userId": -1, "userName": "Гость", "role": "unlinked", "unlinked": True}

    if sender_id in USER_CHAT_CACHE:
        return USER_CHAT_CACHE[sender_id]

    try:
        user_res = await fetch_api(f"/api/internal/telegram-user?chatId={sender_id}")
        if user_res and user_res.get("found"):
            u_info = {
                "userId": user_res.get("userId"),
                "userName": user_res.get("userName"),
                "email": user_res.get("email"),
                "role": user_res.get("role", "user"),
                "unlinked": False
            }
            USER_CHAT_CACHE[sender_id] = u_info
            return u_info
    except Exception as e:
        print(f"[Bot] Error resolving user for sender {sender_id}: {e}")

    # Strict isolation: NEVER fallback to admin (user 1) for unrecognized chat IDs
    return {"userId": -1, "userName": "Гость", "role": "unlinked", "unlinked": True}

class AccessControlMiddleware(BaseMiddleware):
    """Restricts bot access strictly to authorized users, allowing /link for self-linking."""
    def __init__(self, bot_token: str, default_user_id: int):
        self.bot_token = bot_token
        self.default_user_id = default_user_id

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        from_user = getattr(event, "from_user", None)
        sender_id = from_user.id if from_user else None
        chat = getattr(event, "chat", None)
        chat_id = chat.id if chat else sender_id

        # Allow /link command without prior authorization
        if isinstance(event, types.Message):
            msg_text = (event.text or "").strip()
            if msg_text.startswith("/link"):
                return await handler(event, data)

        allowed = BOT_ALLOWED_CHATS.get(self.bot_token, set())

        is_authorized = False
        allowed_normalized = set()
        for a in allowed:
            allowed_normalized.add(str(a).strip())
            try:
                allowed_normalized.add(int(str(a).strip()))
            except ValueError:
                pass

        if sender_id is not None and (sender_id in allowed_normalized or str(sender_id) in allowed_normalized):
            is_authorized = True
        if not is_authorized and chat_id is not None and (chat_id in allowed_normalized or str(chat_id) in allowed_normalized):
            is_authorized = True

        # Check if mapped to a user in database
        if not is_authorized and sender_id:
            user_info = await resolve_sender_user(event, self.default_user_id)
            if user_info.get("email") or (user_info.get("userId", 0) > 0 and not user_info.get("unlinked")):
                is_authorized = True
                allowed.add(sender_id)

        if not is_authorized:
            cid_display = sender_id or chat_id or "Не определен"
            print(f"[Bot Access] ⛔ Access denied for sender {sender_id}, chat {chat_id}. Allowed: {allowed}")
            deny_text = (
                f"👋 <b>Добро пожаловать в Lumière Companion!</b>\n\n"
                f"Ваш Telegram Chat ID: <code>{cid_display}</code>\n\n"
                f"Чтобы связать этот чат со своим профилем в Lumière, введите команду:\n"
                f"<code>/link &lt;email&gt; &lt;пароль&gt;</code>\n\n"
                f"<i>Пример:</i> <code>/link ivan@gmail.com mypassword123</code>\n\n"
                f"Либо администратор сервера может привязать ваш Chat ID в настройках пользователей.\n"
                f"<i>Каждый пользователь имеет полностью изолированную вселенную подписок и истории.</i>"
            )
            if isinstance(event, types.Message):
                await event.answer(deny_text, parse_mode="HTML")
            elif isinstance(event, types.CallbackQuery):
                await event.answer(f"⛔ Чат не привязан. Нажмите /start и введите /link (Chat ID: {cid_display})", show_alert=True)
            return

        return await handler(event, data)

def build_dispatcher(user_id: int, bot_token: str) -> Dispatcher:
    dp = Dispatcher()
    mw = AccessControlMiddleware(bot_token, user_id)
    dp.message.outer_middleware(mw)
    dp.callback_query.outer_middleware(mw)

    async def show_tv_status(user_reply_target, eff_uid: Optional[int] = None):
        if eff_uid is None:
            eff_u = await resolve_sender_user(user_reply_target, user_id)
            eff_uid = eff_u["userId"]
        sessions_data = await fetch_api(f"/api/sessions/active?userId={eff_uid}")
        active_list = (sessions_data or {}).get("sessions", [])

        if not active_list:
            msg = (
                "📺 <b>Сейчас на ТВ ничего не воспроизводится</b>.\n\n"
                "Вы можете найти фильм и нажать «▶ Включить на ТВ» прямо из этого чата!"
            )
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🔍 Найти фильм", callback_data="menu:search", style="primary")],
                [InlineKeyboardButton(text="🎲 Кино-рулетка", callback_data="menu:roulette", style="success")]
            ])
            await user_reply_target.answer(msg, reply_markup=kb, parse_mode="HTML")
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
            f"<i>Управление воспроизведением:</i>"
        )

        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="⏪ 30с", callback_data="tv_cmd:seek:-30"),
                InlineKeyboardButton(text="⏯ Пауза/Старт", callback_data="tv_cmd:toggle_play", style="primary"),
                InlineKeyboardButton(text="⏩ 30с", callback_data="tv_cmd:seek:30"),
            ],
            [
                InlineKeyboardButton(text="⏹ Остановить", callback_data="tv_cmd:stop", style="danger"),
                InlineKeyboardButton(text="🔄 Обновить", callback_data="tv_cmd:refresh"),
            ]
        ])

        raw_poster = sess.get("mediaPoster", "")
        poster_url = clean_poster_url(raw_poster)
        if poster_url:
            try:
                await user_reply_target.answer_photo(photo=poster_url, caption=text, reply_markup=kb, parse_mode="HTML")
                return
            except Exception:
                pass
        await user_reply_target.answer(text, reply_markup=kb, parse_mode="HTML")

    @dp.message(Command("link"))
    async def cmd_link(message: types.Message):
        parts = (message.text or "").strip().split(maxsplit=2)
        sender_id = message.from_user.id if message.from_user else 0
        if len(parts) < 3:
            await message.answer(
                "ℹ️ <b>Привязка аккаунта к Telegram</b>\n\n"
                "Чтобы привязать этот чат к вашему личному профилю Lumière, отправьте команду:\n"
                "<code>/link &lt;email&gt; &lt;пароль&gt;</code>\n\n"
                "<i>Пример:</i> <code>/link ivan@gmail.com mypassword123</code>\n\n"
                f"Ваш Telegram Chat ID: <code>{sender_id}</code>",
                parse_mode="HTML"
            )
            return

        email = parts[1].strip()
        pwd = parts[2].strip()

        link_res = await fetch_api("/api/internal/telegram-link", method="POST", data={
            "chatId": str(sender_id),
            "email": email,
            "password": pwd
        })

        if link_res and link_res.get("success"):
            u_id = link_res.get("userId")
            u_name = link_res.get("userName")
            USER_CHAT_CACHE[sender_id] = {
                "userId": u_id,
                "userName": u_name,
                "email": email,
                "role": "user"
            }
            allowed = BOT_ALLOWED_CHATS.setdefault(bot_token, set())
            allowed.add(sender_id)

            await message.answer(
                f"🎉 <b>Аккаунт успешно привязан!</b>\n\n"
                f"👤 Профиль: <b>{html.escape(str(u_name))}</b>\n"
                f"🆔 User ID: <code>{u_id}</code>\n\n"
                f"Теперь ваши подписки, история просмотров и управление ТВ полностью изолированы для вашего профиля.",
                reply_markup=get_main_reply_keyboard(),
                parse_mode="HTML"
            )
            await cmd_start(message)
        else:
            err = (link_res or {}).get("error", "Неверный email или пароль")
            await message.answer(f"❌ <b>Ошибка привязки</b>: {err}", parse_mode="HTML")

    @dp.message(CommandStart())
    async def cmd_start(message: types.Message):
        eff_u = await resolve_sender_user(message, user_id)
        u_name = eff_u.get("userName")
        profile_badge = f" (Профиль: <b>{html.escape(str(u_name))}</b>)" if u_name else ""
        welcome_text = (
            f"✨ <b>Lumière Companion</b>{profile_badge}\n\n"
            "Ваш персональный кино-ассистент и умный пульт управления:\n\n"
            "🔍 <b>Поиск</b>: отправьте название фильма или сериала в чат\n"
            "📺 <b>Пульт Smart TV</b>: управление воспроизведением на ТВ\n"
            "🎲 <b>Кино-рулетка</b>: случайные фильмы с описанием и актёрами\n"
            "📥 <b>Серверные загрузки</b>: скачивание торрентов на диск сервера\n"
            "🔔 <b>Подписки</b>: уведомления о выходе новых серий\n\n"
            "<i>Выберите действие в меню ниже или воспользуйтесь кнопками быстрого доступа:</i>"
        )
        try:
            await message.answer("🍿 Клавиатура быстрого доступа активирована ⬇️", reply_markup=get_main_reply_keyboard())
        except Exception:
            pass
        await message.answer(welcome_text, reply_markup=get_main_menu_inline_keyboard(), parse_mode="HTML")

    @dp.message(Command("menu"))
    @dp.message(F.text == "✨ Главное меню")
    async def cmd_menu(message: types.Message):
        await message.answer("🍿 <b>Главное меню Lumière:</b>", reply_markup=get_main_menu_inline_keyboard(), parse_mode="HTML")

    @dp.callback_query(F.data == "menu:search")
    async def cb_menu_search(call: types.CallbackQuery):
        await call.answer()
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎲 Или крутите рулетку", callback_data="menu:roulette", style="success")]
        ])
        await call.message.answer(
            "🔎 Напишите название фильма или сериала 🍿:",
            reply_markup=kb,
            parse_mode="HTML"
        )

    @dp.callback_query(F.data == "menu:roulette")
    async def cb_menu_roulette(call: types.CallbackQuery):
        await call.answer("🎲 Крутим рулетку...")
        await trigger_roulette(call, is_callback=True)

    @dp.callback_query(F.data == "menu:tv")
    async def cb_menu_tv(call: types.CallbackQuery):
        await call.answer()
        eff_u = await resolve_sender_user(call, user_id)
        await show_tv_status(call.message, eff_u["userId"])

    @dp.callback_query(F.data == "menu:downloads")
    async def cb_menu_downloads(call: types.CallbackQuery):
        await call.answer()
        eff_u = await resolve_sender_user(call, user_id)
        await show_downloads(call.message, eff_u["userId"])

    @dp.callback_query(F.data == "menu:subs")
    async def cb_menu_subs(call: types.CallbackQuery):
        await call.answer()
        eff_u = await resolve_sender_user(call, user_id)
        await show_subscriptions(call.message, eff_u["userId"])

    @dp.callback_query(F.data == "menu:status")
    async def cb_menu_status(call: types.CallbackQuery):
        await call.answer()
        await show_server_status(call.message)

    @dp.message(Command("search"))
    @dp.message(F.text == "🔍 Поиск")
    async def btn_search(message: types.Message):
        await message.answer(
            "🔎 Напишите название фильма или сериала 🍿:",
            parse_mode="HTML"
        )

    @dp.message(Command("roulette"))
    @dp.message(F.text.in_(["🎲 Рулетка", "🎲 Кино-рулетка"]))
    async def btn_roulette(message: types.Message):
        await trigger_roulette(message, is_callback=False)

    @dp.message(Command("tv"))
    @dp.message(F.text == "📺 Сейчас на ТВ")
    async def btn_tv_status(message: types.Message):
        eff_u = await resolve_sender_user(message, user_id)
        await show_tv_status(message, eff_u["userId"])

    @dp.message(Command("downloads"))
    @dp.message(F.text == "📥 Скачанное")
    async def btn_downloads(message: types.Message):
        eff_u = await resolve_sender_user(message, user_id)
        await show_downloads(message, eff_u["userId"])

    @dp.message(Command("status"))
    @dp.message(F.text.in_(["⚙️ Статус", "📊 Статус"]))
    async def btn_status(message: types.Message):
        await show_server_status(message)

    async def trigger_roulette(user_reply_target, is_callback: bool = False):
        target_msg = user_reply_target.message if is_callback and hasattr(user_reply_target, "message") else user_reply_target
        if is_callback and hasattr(user_reply_target, "answer"):
            try:
                await user_reply_target.answer()
            except Exception:
                pass

        if target_msg and hasattr(target_msg, "answer_dice"):
            try:
                await target_msg.answer_dice(emoji="🎲")
                await asyncio.sleep(2.0)
            except Exception as e:
                print(f"[Bot] Dice animation note: {e}")

        category_endpoints = [
            ("/api/movies/popular", "movie"),
            ("/api/movies/top_rated", "movie"),
            ("/api/tv/popular", "tv"),
            ("/api/tv/top_rated", "tv"),
        ]
        endpoint, default_media_type = random.choice(category_endpoints)
        page = random.randint(1, 4)

        data = await fetch_api(f"{endpoint}?page={page}&lang=ru")
        results = (data or {}).get("results", [])
        if not results:
            data = await fetch_api("/api/movies/popular?page=1&lang=ru")
            results = (data or {}).get("results", [])

        if not results:
            err_text = "⚠️ Не удалось получить список фильмов для рулетки. Попробуйте ещё раз."
            if is_callback:
                await user_reply_target.message.reply(err_text)
            else:
                await user_reply_target.answer(err_text)
            return

        # Prioritize items that already have descriptions
        valid_results = [r for r in results if r.get("description") or r.get("overview")]
        item = random.choice(valid_results) if valid_results else random.choice(results)

        media_id = item.get("id")
        title = item.get("name") or item.get("title") or "Случайный фильм"
        media_type = item.get("type") or ("tv" if "name" in item and "runtime" not in item else default_media_type)
        overview = item.get("description") or item.get("overview") or ""
        rating = float(item.get("score") or item.get("vote_average") or 0)
        date_str = str(item.get("year") or item.get("release_date") or item.get("first_air_date") or "")
        year_str = date_str[:4] if date_str else ""
        raw_poster = item.get("poster") or item.get("poster_path") or ""
        poster_url = clean_poster_url(raw_poster)

        cast_names = []
        try:
            det = await fetch_api(f"/api/{'tv' if media_type == 'tv' else 'movie'}/{media_id}?lang=ru")
            if det:
                if not overview or overview == "—":
                    overview = det.get("description") or det.get("overview") or det.get("tagline") or ""
                cast_list = det.get("cast") or []
                cast_names = [c.get("name") for c in cast_list if isinstance(c, dict) and c.get("name")][:5]
                if not poster_url and (det.get("poster_path") or det.get("poster")):
                    poster_url = clean_poster_url(det.get("poster_path") or det.get("poster"))
        except Exception:
            pass

        if not overview:
            overview = "Описание в базе данных отсутствует."

        ITEM_CACHE[f"{media_type}:{media_id}"] = {
            "title": title,
            "type": media_type,
            "id": media_id,
            "poster": poster_url,
            "year": year_str,
        }

        rating_stars = f"⭐ <b>{rating:.1f}/10</b>" if rating > 0 else ""
        year_badge = f" ({year_str})" if year_str else ""
        cast_text = f"\n\n👥 <b>В главных ролях:</b> {html.escape(', '.join(cast_names))}" if cast_names else ""
        caption = (
            f"🎲 <b>Кино-рулетка Lumière выбрала для вас:</b>\n\n"
            f"🎬 <b>{html.escape(title)}</b>{year_badge} {rating_stars}"
            f"{cast_text}\n\n"
            f"<i>{html.escape(overview[:240])}{'...' if len(overview) > 240 else ''}</i>"
        )

        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="▶ Включить на ТВ", callback_data=f"tv_play:{media_type}:{media_id}", style="primary"),
                InlineKeyboardButton(text="📥 На сервер", callback_data=f"dl_start:{media_type}:{media_id}", style="success"),
            ],
            [
                InlineKeyboardButton(text="🔖 В закладки", callback_data=f"fav_toggle:{media_type}:{media_id}"),
                InlineKeyboardButton(text="🎲 Крутить ещё раз", callback_data="roulette:spin", style="success"),
            ]
        ])

        target_msg = user_reply_target.message if is_callback else user_reply_target
        if poster_url:
            try:
                await target_msg.answer_photo(photo=poster_url, caption=caption, reply_markup=kb, parse_mode="HTML")
                return
            except Exception:
                pass
        await target_msg.answer(caption, reply_markup=kb, parse_mode="HTML")

    @dp.message(F.text == "🎲 Рулетка")
    @dp.message(Command("roulette"))
    @dp.message(Command("random"))
    async def btn_roulette(message: types.Message):
        await trigger_roulette(message, is_callback=False)

    @dp.callback_query(F.data == "roulette:spin")
    async def on_roulette_spin(call: types.CallbackQuery):
        await call.answer("🎲 Крутим рулетку...")
        await trigger_roulette(call, is_callback=True)

    async def show_downloads(target, eff_uid: Optional[int] = None):
        if eff_uid is None:
            eff_u = await resolve_sender_user(target, user_id)
            eff_uid = eff_u["userId"]
        data = await fetch_api(f"/api/downloads/server/list?userId={eff_uid}")
        if not data:
            await target.answer("Не удалось загрузить список загрузок с сервера.")
            return

        downloads = data.get("downloads", [])
        disk = data.get("disk", {})
        free_space = disk.get("free", "Неизвестно")

        if not downloads:
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🔍 Найти фильмы", callback_data="menu:search", style="primary")]
            ])
            await target.answer(
                f"📥 <b>Скачанных файлов на сервере нет</b>.\n\n"
                f"📊 Свободно на диске: <b>{free_space}</b>\n"
                f"Вы можете поставить фильм на загрузку заранее, нажав «📥 На сервер» в результатах поиска.",
                reply_markup=kb,
                parse_mode="HTML"
            )
            return

        text = f"📥 <b>Скачано на сервер ({len(downloads)}):</b>\n"
        text += f"📊 Свободно на диске: <b>{free_space}</b>\n\n"

        for idx, item in enumerate(downloads[:5], 1):
            status_emoji = "✅" if item.get("status") == "completed" else "⏳"
            item_title = html.escape(str(item.get('title') or 'Видео'))
            text += f"{idx}. {status_emoji} <b>{item_title}</b> — {item.get('fileSizeFormatted', '')}\n"

        await target.answer(text, parse_mode="HTML")

        # Send cards for recent downloaded items
        for item in downloads[:3]:
            safe_title = html.escape(str(item.get('title') or 'Видео'))
            card_text = (
                f"📁 <b>{safe_title}</b>\n"
                f"💾 Размер: {item.get('fileSizeFormatted', '')}\n"
                f"Статус: {'Готово к просмотру' if item.get('status') == 'completed' else 'Скачивается...'}"
            )
            dl_buttons = [
                InlineKeyboardButton(text="▶ Включить на ТВ", callback_data=f"tv_play_local:{item.get('id')}", style="primary"),
            ]
            if item.get("status") == "completed":
                download_url = f"{WEB_URL}/api/downloads/server/download-file/{item.get('id')}"
                dl_buttons.append(InlineKeyboardButton(text="⬇️ Скачать", url=download_url))

            ikb = InlineKeyboardMarkup(inline_keyboard=[
                dl_buttons,
                [InlineKeyboardButton(text="🗑 Удалить с диска", callback_data=f"dl_delete:{item.get('id')}", style="danger")]
            ])
            raw_poster = item.get("poster", "")
            poster_url = clean_poster_url(raw_poster)
            if poster_url:
                try:
                    await target.answer_photo(photo=poster_url, caption=card_text, reply_markup=ikb, parse_mode="HTML")
                    continue
                except Exception:
                    pass
            await target.answer(card_text, reply_markup=ikb, parse_mode="HTML")

    @dp.message(F.text == "📥 Скачанное")
    async def btn_downloads(message: types.Message):
        eff_u = await resolve_sender_user(message, user_id)
        await show_downloads(message, eff_u["userId"])

    async def show_subscriptions(target, eff_uid: Optional[int] = None):
        if eff_uid is None or eff_uid <= 0:
            eff_u = await resolve_sender_user(target, user_id)
            eff_uid = eff_u.get("userId", -1)
        if eff_uid <= 0:
            from_u = getattr(target, "from_user", None)
            cid = from_u.id if from_u else ""
            text = (
                "⚠️ <b>Этот Telegram-аккаунт еще не привязан к вашему профилю в Lumière.</b>\n\n"
                f"Ваш Chat ID: <code>{cid}</code>\n\n"
                "Чтобы видеть свои персональные подписки, привяжите аккаунт:\n"
                "<code>/link &lt;email&gt; &lt;пароль&gt;</code>\n"
                "или попросите администратора указать ваш Chat ID в настройках пользователя."
            )
            await target.answer(text, parse_mode="HTML")
            return
        sub_data = await fetch_api(f"/api/notifications/subscriptions?userId={eff_uid}")
        subs = (sub_data or {}).get("subscriptions", [])
        notif_data = await fetch_api(f"/api/notifications?userId={eff_uid}")
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
        await target.answer(text, reply_markup=kb, parse_mode="HTML")

    @dp.message(F.text == "🔔 Подписки")
    async def btn_subscriptions(message: types.Message):
        eff_u = await resolve_sender_user(message, user_id)
        await show_subscriptions(message, eff_u["userId"])

    async def show_server_status(target):
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
        await target.answer(text, parse_mode="HTML")

    @dp.message(F.text == "⚙️ Статус сервера")
    async def btn_server_status(message: types.Message):
        await show_server_status(message)

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
            try:
                title = str(item.get("name") or item.get("title") or "Без названия")
                media_type = str(item.get("type") or item.get("mediaType") or "movie")
                media_id = item.get("id") or item.get("tmdbId")
                score = float(item.get("score") or item.get("voteAverage") or 0)
                year_val = str(item.get("year") or (item.get("releaseDate") or "")[:4] or "")
                overview = str(item.get("description") or item.get("overview") or "")

                raw_poster = item.get("poster") or item.get("posterPath") or ""
                poster_url = clean_poster_url(raw_poster)

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

                # Store item metadata in memory cache to stay safely within Telegram's 64-byte callback_data limit
                cache_key = f"{media_type}:{media_id}"
                ITEM_CACHE[cache_key] = {
                    "title": title,
                    "type": media_type,
                    "id": media_id,
                    "poster": poster_url,
                    "year": year_val
                }

                action_buttons = [
                    InlineKeyboardButton(
                        text="▶ Включить на ТВ",
                        callback_data=f"tv_play:{media_type}:{media_id}",
                        style="primary"
                    ),
                    InlineKeyboardButton(
                        text="📥 На сервер",
                        callback_data=f"dl_start:{media_type}:{media_id}",
                        style="success"
                    ),
                ]

                second_row = [
                    InlineKeyboardButton(
                        text="🔖 В закладки",
                        callback_data=f"fav_toggle:{media_type}:{media_id}",
                    )
                ]
                if media_type == "tv":
                    second_row.append(
                        InlineKeyboardButton(
                            text="🔔 Новые серии",
                            callback_data=f"sub_add:{media_id}",
                            style="primary"
                        )
                    )

                keyboard_rows = [action_buttons, second_row]

                inline_kb = InlineKeyboardMarkup(inline_keyboard=keyboard_rows)

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
            except Exception as item_err:
                print(f"[Bot] Error processing search item {item}: {item_err}")

    # Callback Query Handlers
    @dp.callback_query(F.data.startswith("tv_play:"))
    async def on_tv_play(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_type = parts[1] if len(parts) > 1 else "movie"
        media_id = parts[2] if len(parts) > 2 else ""
        season = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None
        episode = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else None

        cached = ITEM_CACHE.get(f"{media_type}:{media_id}", {})
        raw_title = cached.get("title")
        if not raw_title:
            if len(parts) > 3 and not parts[3].isdigit():
                raw_title = urllib.parse.unquote(parts[3])
            else:
                raw_title = "Медиа"

        if raw_title == "Медиа" and media_id:
            try:
                ep_url = f"/api/tv/{media_id}" if media_type == "tv" else f"/api/movie/{media_id}"
                det = await fetch_api(ep_url)
                if det and (det.get("name") or det.get("title")):
                    raw_title = det.get("name") or det.get("title")
            except Exception:
                pass

        val_dict = {
            "mediaType": media_type,
            "mediaId": media_id,
            "title": raw_title,
        }
        if season is not None:
            val_dict["season"] = season
        if episode is not None:
            val_dict["episode"] = episode

        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u["userId"]

        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": "play_media",
            "deviceType": "tv",
            "userId": eff_uid,
            "value": val_dict
        })

        if res and res.get("success"):
            await call.answer("▶ Команда отправлена на ТВ!", show_alert=True)
            ep_extra = f" (S{season:02d}E{episode:02d})" if (season and episode) else ""
            await call.message.reply(f"🚀 Запускаем <b>«{html.escape(raw_title)}»{ep_extra}</b> на вашем ТВ...", parse_mode="HTML")
        else:
            await call.answer("⚠️ Не удалось отправить на ТВ. Убедитесь, что приложение на ТВ включено.", show_alert=True)

    @dp.callback_query(F.data.startswith("tv_play_local:"))
    async def on_tv_play_local(call: types.CallbackQuery):
        dl_id = call.data.replace("tv_play_local:", "")
        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u["userId"]

        res = await fetch_api("/api/sessions/remote-command", method="POST", data={
            "action": "play_media",
            "deviceType": "tv",
            "userId": eff_uid,
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
        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u["userId"]

        if sub_action == "refresh":
            sessions_data = await fetch_api(f"/api/sessions/active?userId={eff_uid}")
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
            "userId": eff_uid,
        })

        if res and res.get("success"):
            desc = f"{val:+d}с" if sub_action == "seek" else sub_action
            await call.answer(f"Команда выполнена: {desc}")
            # Refresh message after command
            await asyncio.sleep(0.5)
            sessions_data = await fetch_api(f"/api/sessions/active?userId={eff_uid}")
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
        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u["userId"]
        res = await fetch_api(f"/api/notifications/check?userId={eff_uid}", method="POST")
        count = (res or {}).get("newEpisodesFound", 0)
        if count > 0:
            await call.message.reply(f"🎉 Найдено новых серий: <b>{count}</b>! Уведомления отправлены.", parse_mode="HTML")
        else:
            await call.message.reply("✅ Все серии актуальны, новых релизов пока нет.")

    @dp.callback_query(F.data.startswith("sub_add:"))
    async def on_sub_add(call: types.CallbackQuery):
        parts = call.data.split(":")
        tmdb_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0

        cached = ITEM_CACHE.get(f"tv:{tmdb_id}", {})
        raw_title = cached.get("title")
        if not raw_title:
            if len(parts) > 2:
                raw_title = urllib.parse.unquote(parts[2])
            else:
                raw_title = "Сериал"

        if raw_title == "Сериал" and tmdb_id:
            try:
                det = await fetch_api(f"/api/tv/{tmdb_id}")
                if det and (det.get("name") or det.get("title")):
                    raw_title = det.get("name") or det.get("title")
            except Exception:
                pass

        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u.get("userId", -1)
        if eff_uid <= 0:
            await call.answer("⚠️ Сначала привяжите аккаунт: /link <email> <пароль>", show_alert=True)
            return
        res = await fetch_api("/api/notifications/subscribe", method="POST", data={
            "userId": eff_uid,
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

    @dp.callback_query(F.data.startswith("fav_toggle:"))
    async def on_fav_toggle(call: types.CallbackQuery):
        parts = call.data.split(":")
        if len(parts) < 3:
            await call.answer("Ошибка параметров", show_alert=True)
            return

        media_type = parts[1]
        try:
            media_id = int(parts[2])
        except ValueError:
            await call.answer("Некорректный ID", show_alert=True)
            return

        cached = ITEM_CACHE.get(f"{media_type}:{media_id}") or {}
        raw_title = cached.get("title") or "Медиа"
        poster = cached.get("poster") or ""

        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u["userId"]

        fav_data = await fetch_api(f"/api/user/favorites?userId={eff_uid}")
        fav_list = (fav_data or {}).get("favorites", [])
        is_fav = any(f.get("tmdbId") == media_id for f in fav_list)

        if is_fav:
            await fetch_api(f"/api/user/favorites/{media_id}?userId={eff_uid}", method="DELETE")
            await call.answer("❌ Удалено из закладок", show_alert=False)
            new_btn_text = "🔖 В закладки"
        else:
            await fetch_api("/api/user/favorites", method="POST", data={
                "userId": eff_uid,
                "tmdbId": media_id,
                "mediaType": media_type,
                "titleName": raw_title,
                "poster": poster
            })
            await call.answer("✅ Добавлено в закладки!", show_alert=False)
            new_btn_text = "✅ В закладках"

        try:
            if call.message and call.message.reply_markup:
                old_rows = call.message.reply_markup.inline_keyboard
                new_rows = []
                for row in old_rows:
                    new_row = []
                    for btn in row:
                        if btn.callback_data and btn.callback_data.startswith(f"fav_toggle:{media_type}:{media_id}"):
                            new_row.append(InlineKeyboardButton(text=new_btn_text, callback_data=btn.callback_data))
                        else:
                            new_row.append(btn)
                    new_rows.append(new_row)
                await call.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(inline_keyboard=new_rows))
        except Exception:
            pass

    @dp.callback_query(F.data.startswith("dl_seasons:"))
    async def on_dl_seasons(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_id = int(parts[1])
        page = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        await call.answer("Загружаем сезоны...")
        det = await fetch_api(f"/api/tv/{media_id}")
        if not det:
            await call.message.reply("⚠️ Не удалось загрузить информацию о сериале.")
            return

        title = det.get("name") or det.get("title") or "Сериал"
        seasons = det.get("seasons", [])
        valid_seasons = [s for s in seasons if s.get("season_number", 0) > 0]
        if not valid_seasons:
            total_seasons = det.get("seasonsCount") or det.get("number_of_seasons") or 1
            valid_seasons = [{"season_number": i, "name": f"{i} сезон"} for i in range(1, total_seasons + 1)]

        # Sort valid seasons by season_number ascending
        valid_seasons.sort(key=lambda s: s.get("season_number", 1))

        PAGE_SIZE = 20
        total_pages = max(1, (len(valid_seasons) + PAGE_SIZE - 1) // PAGE_SIZE)
        if page >= total_pages:
            page = max(0, total_pages - 1)

        start_idx = page * PAGE_SIZE
        page_seasons = valid_seasons[start_idx : start_idx + PAGE_SIZE]

        builder = InlineKeyboardBuilder()
        for s in page_seasons:
            s_num = s.get("season_number", 1)
            s_name = s.get("name") or f"{s_num} сезон"
            ep_count = s.get("episode_count")
            ep_suffix = f" ({ep_count} сер.)" if ep_count else ""
            builder.button(text=f"📺 {s_name}{ep_suffix}", callback_data=f"dl_eps:{media_id}:{s_num}:0")

        builder.adjust(2)

        # Pagination navigation row
        nav_buttons = []
        if page > 0:
            prev_start = (page - 1) * PAGE_SIZE + 1
            prev_end = page * PAGE_SIZE
            nav_buttons.append(InlineKeyboardButton(text=f"⬅️ Сезоны {prev_start}–{prev_end}", callback_data=f"dl_seasons:{media_id}:{page - 1}"))
        if page < total_pages - 1:
            next_start = (page + 1) * PAGE_SIZE + 1
            next_end = min(len(valid_seasons), (page + 2) * PAGE_SIZE)
            nav_buttons.append(InlineKeyboardButton(text=f"Сезоны {next_start}–{next_end} ➡️", callback_data=f"dl_seasons:{media_id}:{page + 1}"))

        if nav_buttons:
            builder.row(*nav_buttons)

        builder.row(InlineKeyboardButton(text="❌ Отмена", callback_data="dl_cancel"))

        shown_start = start_idx + 1
        shown_end = min(len(valid_seasons), start_idx + PAGE_SIZE)
        nav_hint = "\n\n<i>Для выбора других сезонов используйте стрелки внизу ⬇️</i>" if total_pages > 1 else ""
        text = (
            f"🎯 <b>Выберите сезон сериала для загрузки:</b> (сезоны {shown_start}–{shown_end} из {len(valid_seasons)})\n"
            f"🎬 <b>«{html.escape(title)}»</b>{nav_hint}"
        )
        try:
            await call.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")
        except Exception:
            await call.message.reply(text, reply_markup=builder.as_markup(), parse_mode="HTML")

    @dp.callback_query(F.data.startswith("dl_eps:"))
    async def on_dl_eps(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_id = int(parts[1])
        season_num = int(parts[2])
        ep_page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
        await call.answer("Загружаем список серий...")

        season_data = await fetch_api(f"/api/tv/{media_id}/season/{season_num}")
        episodes = (season_data or {}).get("episodes", [])

        if not episodes:
            det = await fetch_api(f"/api/tv/{media_id}")
            count = 10
            if det and det.get("seasons"):
                matched = next((s for s in det.get("seasons", []) if s.get("season_number") == season_num), None)
                if matched and matched.get("episode_count"):
                    count = matched.get("episode_count")
            episodes = [{"episode": i, "episode_number": i, "name": f"Серия {i}"} for i in range(1, count + 1)]

        det = await fetch_api(f"/api/tv/{media_id}")
        title = (det or {}).get("name") or (det or {}).get("title") or "Сериал"

        EP_PAGE_SIZE = 36
        total_ep_pages = max(1, (len(episodes) + EP_PAGE_SIZE - 1) // EP_PAGE_SIZE)
        if ep_page >= total_ep_pages:
            ep_page = max(0, total_ep_pages - 1)

        start_ep = ep_page * EP_PAGE_SIZE
        page_episodes = episodes[start_ep : start_ep + EP_PAGE_SIZE]

        builder = InlineKeyboardBuilder()
        for ep in page_episodes:
            ep_num = ep.get("episode") or ep.get("episode_number") or 1
            builder.button(text=f"{ep_num} серия", callback_data=f"dl_start:tv:{media_id}:{season_num}:{ep_num}")

        builder.adjust(4)

        nav_buttons = []
        if ep_page > 0:
            nav_buttons.append(InlineKeyboardButton(text="⬅️ Предыдущие серии", callback_data=f"dl_eps:{media_id}:{season_num}:{ep_page - 1}"))
        if ep_page < total_ep_pages - 1:
            nav_buttons.append(InlineKeyboardButton(text="Следующие серии ➡️", callback_data=f"dl_eps:{media_id}:{season_num}:{ep_page + 1}"))
        if nav_buttons:
            builder.row(*nav_buttons)

        season_page = max(0, (season_num - 1) // 20)
        builder.row(
            InlineKeyboardButton(text="⬅️ К сезонам", callback_data=f"dl_seasons:{media_id}:{season_page}"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="dl_cancel")
        )

        ep_page_info = f" (стр. {ep_page + 1}/{total_ep_pages})" if total_ep_pages > 1 else ""
        text = (
            f"🎯 <b>Выберите серию для загрузки на сервер:</b>{ep_page_info}\n"
            f"🎬 <b>«{html.escape(title)}»</b> — Сезон {season_num}\n\n"
            f"<i>Бот найдет и скачает на диск именно выбранную серию.</i>"
        )
        try:
            await call.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="HTML")
        except Exception:
            await call.message.reply(text, reply_markup=builder.as_markup(), parse_mode="HTML")

    @dp.callback_query(F.data.startswith("dl_start:") | F.data.startswith("dl_server:"))
    async def on_dl_start(call: types.CallbackQuery):
        parts = call.data.split(":")
        media_type = parts[1] if len(parts) > 1 else "movie"
        media_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        season = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else None
        episode = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else None

        cached = ITEM_CACHE.get(f"{media_type}:{media_id}", {})
        raw_title = cached.get("title")
        poster = cached.get("poster", "")

        if not raw_title or not poster:
            if len(parts) > 3 and not parts[3].isdigit():
                raw_title = urllib.parse.unquote(parts[3])
            else:
                raw_title = "Медиа"

            if media_id:
                try:
                    ep_url = f"/api/tv/{media_id}" if media_type == "tv" else f"/api/movie/{media_id}"
                    det = await fetch_api(ep_url)
                    if det:
                        if det.get("name") or det.get("title"):
                            raw_title = det.get("name") or det.get("title")
                        p_path = det.get("poster_path") or det.get("poster")
                        if p_path and not poster:
                            poster = clean_poster_url(p_path)
                except Exception:
                    pass

        # If it's a TV show and season is not chosen yet, ask user: single episode or whole show?
        if media_type == "tv" and (season is None):
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🎯 Скачать конкретную серию", callback_data=f"dl_seasons:{media_id}"),
                ],
                [
                    InlineKeyboardButton(text="📦 Скачать весь сезон / сериал", callback_data=f"dl_start:tv:{media_id}:0:0"),
                ],
                [
                    InlineKeyboardButton(text="❌ Отмена", callback_data="dl_cancel", style="danger")
                ]
            ])
            await call.answer()
            prompt_text = (
                f"📥 <b>Скачивание сериала на сервер:</b>\n\n"
                f"🎬 <b>«{html.escape(raw_title)}»</b>\n\n"
                f"Что вы хотите скачать?"
            )
            try:
                await call.message.reply(prompt_text, reply_markup=kb, parse_mode="HTML")
            except Exception:
                await call.message.answer(prompt_text, reply_markup=kb, parse_mode="HTML")
            return

        await call.answer("🔍 Ищем доступные релизы на торрентах...")
        is_tv_episode = (season is not None and episode is not None and season > 0 and episode > 0)
        target_year = cached.get("year", "")
        year_param = f"&year={target_year}" if target_year else ""

        # Multi-query strategy for TV episodes vs movies
        queries_to_try = []
        if is_tv_episode:
            queries_to_try.append(f"{raw_title} {season} сезон")
            queries_to_try.append(f"{raw_title} S{season:02d}E{episode:02d}")
            queries_to_try.append(raw_title)
            orig_t = cached.get("original_title") or cached.get("original_name")
            if orig_t and orig_t.strip().lower() != raw_title.strip().lower():
                queries_to_try.append(f"{orig_t} S{season:02d}")
                queries_to_try.append(orig_t)
        else:
            queries_to_try.append(raw_title)

        torrents = []
        seen_keys = set()

        for q_try in queries_to_try:
            extra_params = f"&season={season}&episode={episode}" if is_tv_episode else ""
            torr_res = await fetch_api(f"/api/torrents/search?q={urllib.parse.quote(q_try)}&tmdbId={media_id}&type={media_type}{year_param}{extra_params}")
            results = (torr_res or {}).get("results", []) or (torr_res or {}).get("torrents", [])
            for r in results:
                k = r.get("hash") or r.get("magnet") or r.get("title")
                if k and k not in seen_keys:
                    seen_keys.add(k)
                    torrents.append(r)
            if is_tv_episode and len(torrents) >= 15:
                break

        # Strict Season Filtering for TV shows
        if is_tv_episode and torrents:
            def matches_season(t_title: str, s: int) -> bool:
                rm = re.search(r'(\d+)\s*[-–—]\s*(\d+)\s*(?:сезон|season)', t_title, re.I) or \
                     re.search(r'(?:сезон[ыа]?|seasons?)\s*[:.]?\s*(\d+)\s*[-–—]\s*(\d+)', t_title, re.I)
                if rm:
                    nums = [int(n) for n in rm.groups() if n.isdigit()]
                    if len(nums) >= 2 and min(nums) <= s <= max(nums):
                        return True
                exact_p = [
                    rf'\b{s}\s*сезон',
                    rf'сезон[а-я]*\s*[:.]?\s*{s}\b',
                    rf's0*{s}(?![0-9])',
                    rf'\b0*{s}[xх]\d+',
                    rf'season\s*0*{s}\b',
                ]
                if any(re.search(p, t_title, re.I) for p in exact_p):
                    return True
                return False

            def is_wrong_season(t_title: str, s: int) -> bool:
                other_m = re.findall(r'(\d+)\s*сезон|сезон[а-я]*\s*[:.]?\s*(\d+)|s0*(\d+)|season\s*0*(\d+)', t_title, re.I)
                for group in other_m:
                    for num_str in group:
                        if num_str and int(num_str) != s:
                            if not matches_season(t_title, s):
                                return True
                return False

            season_matches = [t for t in torrents if matches_season(t.get("title", ""), season)]
            if not season_matches:
                await call.message.reply(
                    f"⚠️ На торрент-трекерах пока нет релизов для <b>{season} сезона</b> сериала «{html.escape(raw_title)}».\n"
                    f"<i>Возможно, этот сезон еще не вышел или не был выложен на трекеры.</i>",
                    parse_mode="HTML"
                )
                return
            torrents = season_matches

        if not torrents:
            ep_note = f" (Сезон {season}, Серия {episode})" if is_tv_episode else ""
            await call.message.reply(f"⚠️ Торрент-релизы не найдены для «{html.escape(raw_title)}»{ep_note}.")
            return

        # Sort releases: prioritize exact episode, then seeders
        if is_tv_episode:
            def episode_score(t: dict) -> tuple:
                t_title = t.get("title", "")
                exact_ep = bool(
                    re.search(rf'\b0*{episode}\s*(?:выпуск|сери[яий]|эпизод)', t_title, re.I) or
                    re.search(rf'(?:выпуск|сери[яий]|эпизод)\s*[:#№]?\s*0*{episode}\b', t_title, re.I) or
                    re.search(rf'\b0*{season}[xх]0*{episode}\b', t_title, re.I) or
                    re.search(rf's0*{season}e0*{episode}\b', t_title, re.I)
                )
                range_ep = False
                erm = re.search(r'(\d+)\s*[-–—]\s*(\d+)\s*(?:выпуск|сери)', t_title, re.I)
                if erm:
                    nums = [int(n) for n in erm.groups() if n.isdigit()]
                    if len(nums) >= 2 and min(nums) <= episode <= max(nums):
                        range_ep = True
                seeds = t.get("seeders", 0)
                return (1 if exact_ep else (0.5 if range_ep else 0), seeds > 0, seeds)

            torrents.sort(key=episode_score, reverse=True)
        else:
            torrents.sort(key=lambda x: (x.get("seeders", 0) > 0, x.get("seeders", 0)), reverse=True)

        options = torrents[:5]
        builder = InlineKeyboardBuilder()
        releases_summary = []
        num_emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]

        title_display = f"{raw_title} S{season:02d}E{episode:02d}" if is_tv_episode else raw_title

        for idx, t in enumerate(options, 1):
            pick_id = uuid.uuid4().hex[:8]
            badge = parse_torrent_badge(t.get("title", ""), t.get("sizeFormatted", ""), t.get("seeders", 0))
            raw_t_title = t.get("title", "")

            pack_note = ""
            emoji_prefix = num_emojis[idx - 1] if idx <= 5 else f"{idx}."
            quality_tag = badge.split(" • ")[0]
            size_tag = t.get("sizeFormatted", "").replace(" ", "")

            if is_tv_episode:
                is_single = bool(
                    re.search(rf'\b0*{episode}\s*(?:выпуск|сери[яий]|эпизод)', raw_t_title, re.I) or
                    re.search(rf'(?:выпуск|сери[яий]|эпизод)\s*[:#№]?\s*0*{episode}\b', raw_t_title, re.I) or
                    re.search(rf'\b0*{season}[xх]0*{episode}\b', raw_t_title, re.I) or
                    re.search(rf's0*{season}e0*{episode}\b', raw_t_title, re.I)
                )
                if is_single:
                    btn_title = f"{emoji_prefix} {quality_tag} · Серия {episode} ({size_tag})" if size_tag else f"{emoji_prefix} {quality_tag} · Серия {episode}"
                else:
                    btn_title = f"{emoji_prefix} {quality_tag} · Серия {episode} (из пака)"
                    pack_note = f"\n   ℹ️ <i>Пак сезона ({size_tag}). Сервер скачает только файл серии {episode}.</i>"
            else:
                btn_title = f"{emoji_prefix} {quality_tag} · {size_tag}" if size_tag else f"{emoji_prefix} {quality_tag}"

            TORRENT_PICK_CACHE[pick_id] = {
                "title": title_display,
                "media_type": media_type,
                "media_id": media_id,
                "season": season or 0,
                "episode": episode or 0,
                "poster": poster or "",
                "magnet": t.get("magnet") or t.get("link", ""),
                "hash": t.get("hash", ""),
                "file_size": t.get("size", 0),
                "file_name": raw_t_title,
                "badge": badge,
            }

            builder.button(text=btn_title, callback_data=f"dl_pick:{pick_id}", style="success")

            clean_t_title = html.escape(raw_t_title.strip())
            if len(clean_t_title) > 180:
                clean_t_title = clean_t_title[:177] + "..."
            releases_summary.append(f"{emoji_prefix} <code>{clean_t_title}</code>\n   👉 <b>{badge}</b>{pack_note}")

        builder.button(text="❌ Отмена", callback_data="dl_cancel", style="danger")
        builder.adjust(2, 2, 2)

        if is_tv_episode:
            pick_text = (
                f"📥 <b>Выберите релиз для загрузки серии на сервер:</b>\n"
                f"🎬 <b>«{html.escape(raw_title)}»</b> (Сезон {season}, Серия {episode})\n\n"
                + "\n\n".join(releases_summary)
                + f"\n\n<i>🎯 Сервер автоматически скачает на диск только серию {episode}!</i>"
            )
        else:
            pick_text = (
                f"📥 <b>Выберите релиз для загрузки на сервер:</b>\n"
                f"🎬 <b>«{html.escape(raw_title)}»</b>\n\n"
                + "\n\n".join(releases_summary)
                + "\n\n<i>Нажмите кнопку ниже для скачивания на диск сервера:</i>"
            )
        try:
            await call.message.edit_text(pick_text, reply_markup=builder.as_markup(), parse_mode="HTML")
        except Exception:
            await call.message.reply(pick_text, reply_markup=builder.as_markup(), parse_mode="HTML")

    @dp.callback_query(F.data.startswith("dl_pick:"))
    async def on_dl_pick(call: types.CallbackQuery):
        pick_id = call.data.replace("dl_pick:", "")
        cached = TORRENT_PICK_CACHE.get(pick_id)
        if not cached:
            await call.answer("⚠️ Данные выбора устарели. Запустите выбор заново.", show_alert=True)
            return

        await call.answer("⏳ Ставим на загрузку...")
        eff_u = await resolve_sender_user(call, user_id)
        eff_uid = eff_u["userId"]

        res = await fetch_api("/api/downloads/server/start", method="POST", data={
            "userId": eff_uid,
            "title": cached["title"],
            "mediaType": cached["media_type"],
            "mediaId": cached["media_id"],
            "season": cached.get("season", 0),
            "episode": cached.get("episode", 0),
            "poster": cached.get("poster", ""),
            "magnet": cached["magnet"],
            "torrentHash": cached["hash"],
            "torrentIndex": 0,
            "fileSize": cached.get("file_size", 0),
            "fileName": cached.get("file_name", ""),
        })

        if res and res.get("success"):
            badge_info = f" ({cached.get('badge')})" if cached.get('badge') else ""
            dl_id = res.get("id") or cached.get("hash")
            ep_note = ""
            if cached.get("season") and cached.get("episode"):
                ep_note = f"\n🎯 <b>Будет скачан только файл серии {cached['episode']} (Сезон {cached['season']})</b>, а не весь сезон.\n"
            success_text = (
                f"✅ Релиз <b>«{html.escape(cached['title'])}»</b>{badge_info} успешно поставлен на загрузку на диск сервера!{ep_note}\n"
                f"После завершения скачивания вы получите уведомление."
            )
            download_url = f"{WEB_URL}/api/downloads/server/download-file/{dl_id}"
            ikb = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="⬇️ Скачать на устройство", url=download_url),
                    InlineKeyboardButton(text="▶ Включить на ТВ", callback_data=f"tv_play:{cached['media_type']}:{cached['media_id']}", style="primary"),
                ],
                [
                    InlineKeyboardButton(text="📂 Открыть «Скачанное»", callback_data="nav_downloads", style="primary"),
                ]
            ])
            try:
                await call.message.edit_text(success_text, reply_markup=ikb, parse_mode="HTML")
            except Exception:
                await call.message.reply(success_text, reply_markup=ikb, parse_mode="HTML")
        else:
            await call.message.reply("⚠️ Ошибка при запуске загрузки на сервер.")

    @dp.callback_query(F.data == "dl_cancel")
    async def on_dl_cancel(call: types.CallbackQuery):
        await call.answer("Отменено")
        try:
            await call.message.delete()
        except Exception:
            pass

    @dp.callback_query(F.data == "nav_downloads")
    async def on_nav_downloads(call: types.CallbackQuery):
        await call.answer()
        data = await fetch_api("/api/downloads/server/list")
        if not data:
            await call.message.reply("Не удалось загрузить список загрузок с сервера.")
            return

        downloads = data.get("downloads", [])
        disk = data.get("disk", {})
        free_space = disk.get("free", "Неизвестно")

        if not downloads:
            await call.message.reply(
                f"📥 <b>Скачанных файлов на сервере нет</b>.\n\n"
                f"📊 Свободно на диске: <b>{free_space}</b>",
                parse_mode="HTML"
            )
            return

        text = f"📥 <b>Скачано на сервер ({len(downloads)}):</b>\n"
        text += f"📊 Свободно на диске: <b>{free_space}</b>\n\n"

        for idx, item in enumerate(downloads[:5], 1):
            status_emoji = "✅" if item.get("status") == "completed" else "⏳"
            item_title = html.escape(str(item.get('title') or 'Видео'))
            text += f"{idx}. {status_emoji} <b>{item_title}</b> — {item.get('fileSizeFormatted', '')}\n"

        await call.message.reply(text, parse_mode="HTML")

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
    dp = build_dispatcher(user_id, token)

    try:
        me = await bot.get_me()
        print(f"[Bot] Bot @{me.username} ({me.first_name}) connected successfully for user {user_id}!")
        try:
            bot_cmds = [
                BotCommand(command="start", description="✨ Главное меню"),
                BotCommand(command="search", description="🔍 Поиск фильмов и сериалов"),
                BotCommand(command="roulette", description="🎲 Случайный фильм (Рулетка)"),
                BotCommand(command="tv", description="📺 Пульт и просмотр на ТВ"),
                BotCommand(command="downloads", description="📥 Скачанное на сервер"),
                BotCommand(command="status", description="⚙️ Статус сервера"),
            ]
            await bot.set_my_commands(bot_cmds)
            await bot.set_chat_menu_button(menu_button=MenuButtonCommands())
            print(f"[Bot] Commands and menu button successfully set for @{me.username}")
        except Exception as mbe:
            print(f"[Bot] Commands/MenuButton setup note: {mbe}")
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
                    raw_chat = str(b.get("chatId", "")).strip()
                    if not token:
                        continue
                    active_tokens.add(token)

                    # Parse allowed chat IDs (support comma/semicolon/space separated list of numbers)
                    allowed_set: Set[int] = set()
                    for piece in raw_chat.replace(";", ",").replace(" ", ",").split(","):
                        p = piece.strip()
                        if p:
                            try:
                                allowed_set.add(int(p))
                            except ValueError:
                                pass
                    for extra_cid in b.get("allowedChatIds", []):
                        if extra_cid:
                            try:
                                allowed_set.add(int(str(extra_cid).strip()))
                            except ValueError:
                                pass
                    BOT_ALLOWED_CHATS[token] = allowed_set

                    if token not in running_tasks:
                        print(f"[BotManager] Launching companion bot for user {u_id} ({b.get('userName')}), allowed chats: {allowed_set or 'NONE (Restricted)'}")
                        task = asyncio.create_task(run_bot_instance(token, u_id, proxy_url))
                        running_tasks[token] = task

                # Cancel bots that were removed from settings
                removed = [tok for tok in running_tasks.keys() if tok not in active_tokens]
                for tok in removed:
                    print(f"[BotManager] Cancelling removed bot token: {tok[:10]}...")
                    running_tasks[tok].cancel()
                    del running_tasks[tok]
                    BOT_ALLOWED_CHATS.pop(tok, None)
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

# LUMIERE — План развития проекта

> Современный медиацентр с собственной архитектурой и системой провайдеров.
> Мультиплатформа: Web + Android (Capacitor) + Samsung TizenOS + LG webOS

---

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    КЛИЕНТЫ                               │
│  Web (React) │ Android (Capacitor) │ TizenOS (WGT)     │
└──────┬──────────────┬──────────────────┬────────────────┘
       │              │                  │
       ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                  NGINX / REVERSE PROXY                   │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│               BACKEND (Fastify / Node.js)                │
│                                                         │
│  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Auth   │ │  Metadata    │ │  Online  │ │  Sync    │  │
│  │ JWT+DB   │ │  Provider    │ │ Aggregator│ │ TimeCode │  │
│  │          │ │  (TMDB→...)  │ │ (Plugins) │ │          │  │
│  └──────────┘ └──────────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ TorrServ │ │ JacRed   │ │ Tracks   │ │ Telegram │  │
│  │ Wrapper  │ │ Wrapper  │ │ Subs     │ │ Notify   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Playwrt  │ │ GeoIP    │ │   WAF    │               │
│  │ Scraper  │ │ Blocking │ │ Security │               │
│  └──────────┘ └──────────┘ └──────────┘               │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │  Plugin System: load/unload/sandbox providers │       │
│  └──────────────────────────────────────────────┘       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    СЕРВИСЫ                               │
│  TorrServer │ JacRed │ Redis │ PostgreSQL │ Playwright  │
└─────────────────────────────────────────────────────────┘
```

---

## Стек технологий

| Слой | Технология |
|------|-----------|
| Фронтенд | React 18, TypeScript, Vite, Tailwind CSS |
| Мобильный | Capacitor 8 (Android) |
| Smart TV | Samsung Tizen WGT / LG webOS IPK |
| Бэкенд | Fastify (Node.js) |
| БД | PostgreSQL + SQLite (локально) |
| Кеш | Redis |
| Авторизация | JWT (access + refresh tokens) |
| Стриминг | TorrServer, HLS.js, Dash.js |
| Субтитры | FFprobe |
| Транскодинг | GStreamer / FFmpeg |
| Скрейпинг | Playwright (Chromium) |
| Docker | docker-compose |

---

## Требования

1. **Платформы**: Web + Android (телефон/планшет/ТВ) + Samsung TizenOS + LG webOS
2. **Авторизация**: JWT + PostgreSQL (везде кроме localhost)
3. **Языки**: Русский + Английский (react-i18next)
4. **Провайдеры**: Плагинная система. Основные входят в поставку, остальные устанавливаются как плагины
5. **Metadata Provider**: Абстракция над источниками метаданных (TMDB сегодня, IMDb завтра, Кинопоиск послезавтра)
6. **Полная независимость** от Lampac/Lampa сервисов

---

## ФАЗА 1: Фронт ↔ Бэкенд + Metadata Provider (MVP)

**Цель**: Убрать все моки, подключить Metadata Provider (TMDB как первый)

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 1.1 | Vite proxy `/api` → `localhost:3000` | `vite.config.ts` |  |
| 1.2 | API-клиент (fetch wrapper) | `src/api/client.ts` |  |
| 1.3 | Хуки: `useTrending`, `usePopular`, `useSearch`, `useDetails` | `src/hooks/` |  |
| 1.4 | Metadata Provider интерфейс (TMDB как первый) | `back/src/services/metadata/` |  |
| 1.5 | Home → динамический Feed из Metadata Provider | `Home.tsx`, `Hero.tsx` |  |
| 1.6 | Search → реальный поиск через Metadata Provider | `SearchView.tsx` |  |
| 1.7 | MovieDetails → данные из Metadata Provider | `MovieDetails.tsx` |  |
| 1.8 | MoviesLibrary → Metadata Provider discover | `MoviesLibrary.tsx` |  |
| 1.9 | TVShows → Metadata Provider TV + сезон/эпизоды | `TVShows.tsx`, `EpisodeDetails.tsx` |  |
| 1.10 | AnimeView → Metadata Provider anime | `AnimeView.tsx` |  |
| 1.11 | Удалить `content.ts` (mock data) | `src/data/content.ts` |  |

---

## ФАЗА 2: Авторизация + БД

**Цель**: JWT-авторизация, пользователи, профиль

| # | Задача |
|---|--------|
| 2.1 | PostgreSQL в Docker |
| 2.2 | Миграции: users, sessions, watch_history, favorites, bookmarks |
| 2.3 | Auth API: register, login, refresh, logout |
| 2.4 | JWT middleware для Fastify |
| 2.5 | Страница логина/регистрации на фронте |
| 2.6 | Профиль → привязка к БД |
| 2.7 | History → watch_history из БД |
| 2.8 | Favorites → bookmarks из БД |

---

## ФАЗА 3: Плагинная система провайдеров

**Цель**: Плагин-архитектура для контент-провайдеров. Основные — в поставке, остальные — плагины.

### Провайдеры (входят в поставку)

#### OnlineRUS (основные русские — входят в поставку)
- Collaps, HDVB, Kinobase, FanCDN, Mirage, Phantom, Spectre, VeoVeo, VideoDB, Videoseed, Zetflix, ZetflixDB, CDNvideohub, Kinogo, Kinotochka, LeProduction, RutubeMovie, VoKino, IptvOnline

#### OnlinePaid (платные/премиум — входят в поставку)
- Rezka, RezkaPremium, Filmix, FilmixPartner, FilmixTV, KinoPub, Alloha, GetsTV, iRemux, SakhTV

#### OnlineAnime (аниме — входят в поставку, 12+)
- AniLibria, AniLiberty, AniMedia, AnimeGo, AnimeLib, AnimeBesst, AnimeVost, Dreamerscast, Kodik, Mikai, MoonAnime, AnimeON

#### OnlineENG (англоязычные — плагины)
- AutoEmbed, HydraFlix, MovPI, PlayEmbed, RgShows, SmashyStream, TwoEmbed, VidLink, VidSrc, Videasy

#### OnlineUKR (украинские — плагины)
- Ashdi, BamBoo, Eneyida, HDVB UA, Kinoukr, Tortuga, UAFilm, UaKino

#### OnlineGEO (грузинские — плагины)
- Kinoflix, AsiaGe, Geosaitebi

### Плагин-система

| # | Задача |
|---|--------|
| 3.0 | Архитектура плагинов: интерфейс `ContentProvider`, загрузчик, sandbox |
| 3.1 | Провайдеры OnlineRUS (основные) |
| 3.2 | Провайдеры OnlinePaid (премиум) |
| 3.3 | Провайдеры OnlineAnime |
| 3.4 | Провайдеры OnlineENG (плагины) |
| 3.5 | Провайдеры OnlineUKR + GEO (плагины) |
| 3.6 | Playwright-интеграция для JS-защиты |
| 3.7 | API: `/api/online/search`, `/api/online/stream`, `/api/online/episode` |
| 3.8 | Фронт: UI выбора источника при воспроизведении |
| 3.9 | Marketplace плагинов (установка/обновление) |

---

## ФАЗА 4: Видеоплеер + TorrServer + JacRed

**Цель**: Рабочее воспроизведение видео

| # | Задача |
|---|--------|
| 4.1 | Интеграция с TorrServer (обавторизация, выбор файла) |
| 4.2 | JacRed wrapper (поиск торрентов: RuTracker, Kinozal, NNMClub, RuTor, Toloka, Bitru) |
| 4.3 | HLS/DASH плеер (hls.js / dash.js) |
| 4.4 | Субтитры (Tracks + FFprobe) |
| 4.5 | Транскодинг (GStreamer / FFmpeg wrapper) |
| 4.6 | TimeCode (сохранение позиции воспроизведения) |
| 4.7 | Прогресс просмотра в профиле |

---

## ФАЗА 5: Синхронизация + Кросс-девайс

**Цель**: Работа на всех устройствах с синхронизацией

| # | Задача |
|---|--------|
| 5.1 | Sync API: bookmark sync, history sync |
| 5.2 | Capacitor для Android (phone/tablet/TV) |
| 5.3 | Samsung Tizen виджет |
| 5.4 | LG webOS виджет |
| 5.5 | Push-уведомления (Android) |
| 5.6 | Telegram-бот уведомлений о новых сериях |

---

## ФАЗА 6: Безопасность + Локализация

**Цель**: WAF, i18n

| # | Задача |
|---|--------|
| 6.1 | WAF: геоблокировка, rate limiting, brute-force protection |
| 6.3 | i18n: react-i18next, переводы RU/EN |
| 6.4 | Все тексты UI → переводы |

---

## ФАЗА 7: Дополнительно

**Цель**: Полировка и расширение

| # | Задача |
|---|--------|
| 7.1 | DLNA/UPnP медиасервер |
| 7.2 | RCH (WebSocket-реле для клиентов за NAT) |
| 7.3 | AdminPanel (✅ Сделано: статус сервера, FFmpeg сессии, управление кешем) |
| 7.4 | Heatmap активности |
| 7.5 | Кастомные темы |
| 7.6 | Watch Together (синхронный просмотр) |
| 7.7 | Telegram Auth (привязка устройств) |
| 7.8 | IPTV (✅ Сделано: M3U8 парсер, EPG, логотипы, тв-гайд, избранное) |

---

## Docker-сервисы

```yaml
services:
  frontend:        # React + Vite (dev) / Nginx (prod)
  backend:         # Fastify + Node.js
  postgresql:      # БД: users, history, sync
  redis:           # Кеш сессий, rate limiting, TMDB cache
  torrserver:      # Торрент-стриминг
  jacred:          # Агрегатор торрент-индексаторов
  playwright:      # Скрейпинг JS-защищённых сайтов
  ffmpeg:          # Транскодинг
```

---

## Текущее состояние (аудит)

| Компонент | Статус |
|-----------|--------|
| UI (23+ компонента) | ✅ Готово |
| Backend (Fastify + TMDB) | ✅ Готово |
| Docker compose (7 сервисов) | ✅ Готово |
| Frontend ↔ Backend связь | ✅ Фаза 1 |
| Metadata Provider (абстракция) | ✅ Фаза 1 |
| Авторизация | ✅ Фаза 2 (JWT + PostgreSQL) |
| Плагин-система провайдеров | ⚠️ Фаза 3 (Collaps + HDVB, остальные не сделаны) |
| Видеоплеер | ✅ Фаза 4 (HLS.js + FFmpeg, мульти-аудио, субтитры) |
| TorrServer интеграция | ✅ Фаза 4 |
| JacRed интеграция | ✅ Фаза 4 (удалённый API) |
| Субтитры | ✅ Работают (внешние .srt/.vtt из торрента) |
| Мульти-аудио | ✅ Работает (выбор дорожки с сохранением позиции) |
| IPTV | ✅ M3U8 плейлисты + EPG + логотипы + тв-гайд |
| Sync API | ✅ Фаза 5.1 (watch history + favorites sync) |
| Локализация (i18n) | ✅ Фаза 6.3 (react-i18next + переключатель RU/EN + все основные компоненты) |
| Android (Capacitor) | ❌ Фаза 5 не сделана |
| Tizen/webOS виджеты | ❌ Фаза 5 не сделана |
| WAF | ❌ Фаза 6 не сделана |
| DLNA | ❌ Фаза 7 не сделана |
| AdminPanel | ✅ Фаза 7 (статус сервера, FFmpeg сессии, кеш) |

---

## Приоритеты

### Высокий (MVP)
1. ~~Фронт ↔ Бэкенд (убрать моки)~~ ✅ Фаза 1
2. ~~Metadata Provider (абстракция + TMDB как первый)~~ ✅ Фаза 1
3. Плагин-система провайдеров (5-10 основных)
4. Авторизация (JWT + PostgreSQL)
5. Рабочий видеоплеер

### Средний
6. Все основные провайдеры (30+)
7. TorrServer + JacRed
8. Субтитры + транскодинг
9. Capacitor (Android)

### Низкий
10. Tizen/webOS виджеты
11. WAF + GeoIP
12. DLNA
13. Watch Together
14. AdminPanel

---

*Создано: 2026-07-25*
*Проект: Lumiere*

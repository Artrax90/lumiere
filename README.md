<div align="center">

<img src="icon.png" alt="Lumière Logo" width="96" height="96" />

# Lumière

### Self-Hosted Кинотеатр & Стриминговый Медиацентр Нового Поколения

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tizen](https://img.shields.io/badge/Samsung_Tizen-5.5+-1428A0?style=for-the-badge&logo=samsung&logoColor=white)](front/tizen/)
[![Android](https://img.shields.io/badge/Android_TV-Leanback-3DDC84?style=for-the-badge&logo=android&logoColor=white)](ANDROID-TV-INSTALL-GUIDE.md)

<p align="center">
  <b>Кинематографичный интерфейс, мгновенный стриминг торрентов без ожидания загрузки, IPTV, мультипрофили и поддержка экранов любого размера: от смартфонов до Smart TV.</b>
</p>

---

<img src="lumiere.png" alt="Lumière Interface" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

</div>

---

## ✨ Основные возможности

- 🎬 **Богатый каталог кино и сериалов**:
  - Полная интеграция с **TMDB** (The Movie Database): рейтинги, постеры высокого разрешения, трейлеры, персонализированные полки («Популярное», «Сейчас смотрят», «Топ-10», рекомендации).
  - Умная разбивка сериалов по сезонам и эпизодам с превью, кратким описанием и запоминанием просмотренных серий.
- ⚡ **Мгновенный стриминг торрентов**:
  - Встроенный движок **TorrServer**: воспроизведение видеопотока начинается через 2–5 секунд после выбора торрента, без предварительного скачивания файла на диск.
  - Поиск релизов через агрегатор **JacRed** прямо из интерфейса (фильтрация по качеству 4K/1080p, сидам, размеру и переводу).
- 🔄 **Универсальный видеоплеер (HLS + Direct Stream)**:
  - Автоматический трансмуксинг и транскодирование аудио/видео на лету через **FFmpeg**: воспроизводит любые форматы и контейнеры (MKV, MP4, AVI, HEVC/H.265, H.264, 10-bit).
  - Переключение аудиодорожек и встроенных/внешних субтитров.
  - Мгновенная плавная перемотка и возобновление просмотра с точного таймкода.
- 📡 **IPTV и онлайн-телевидение**:
  - Поддержка плейлистов M3U / M3U8.
  - Программа передач (EPG), категории каналов и быстрый доступ к избранному.
- 👨‍👩‍👧‍👦 **Семейные профили и безопасность**:
  - Экран «Кто смотрит?» при входе в систему.
  - Раздельная история просмотров и избранного для каждого члена семьи.
  - **Детский режим (Kids Mode)** с автоматической фильтрацией взрослого контента.
  - Защита профилей 4-значным **PIN-кодом**.
- 📱 **Поддержка любых устройств**:
  - 🌐 **Web**: Адаптивный веб-клиент (PWA) для любых браузеров (ПК, Mac, планшеты, смартфоны).
  - 📺 **Samsung Smart TV (Tizen)**: Нативное приложение для телевизоров Samsung (Tizen 5.5+) с поддержкой пультов OneRemote, D-Pad и запуск через **Media Station X**.
  - 🤖 **Android TV & Google TV**: Универсальный APK с поддержкой Leanback Launcher, Xiaomi Mi Box, Sony, TCL, Fire TV и мобильных телефонов.

---

## 🚀 Самый быстрый способ установки: Docker Compose

Все компоненты (PostgreSQL, TorrServer, Backend Fastify и Frontend) упакованы в готовый Docker-стек.

### 1. Клонируйте репозиторий:
```bash
git clone https://github.com/Artrax90/lumiere.git
cd lumiere
```

### 2. Запустите проект:
```bash
docker compose up -d
```

### 3. Откройте в браузере:
Перейдите по адресу:
👉 **[http://localhost:3500](http://localhost:3500)** *(или `http://<IP_вашего_сервера>:3500` в домашней сети)*.

При первом открытии появится мастер первоначальной настройки:
1. Задайте имя, email и пароль первого пользователя (Администратора).
2. В разделе **Настройки** (`/settings`) укажите ваш ключ TMDB.
3. Всё готово к просмотру!

---

## ⚙️ Конфигурация (.env)

Для тонкой настройки сервера перед запуском скопируйте файл конфигурации:
```bash
cp .env.example .env
```

Параметры файла `.env`:

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3500` | Порт веб-сервера и REST API |
| `TORRSERVER_PORT` | `8590` | Порт TorrServer на хост-машине |
| `TMDB_TOKEN` | *пусто* | API Read Access Token от TMDB ([получить бесплатно](https://www.themoviedb.org/settings/api)) |
| `TMDB_PROXY_URL` | *пусто* | SOCKS5 или HTTP прокси для TMDB (если сервис заблокирован у вашего провайдера) |
| `DB_HOST` | `postgres` | Хост базы данных PostgreSQL |
| `DB_PORT` | `5432` | Порт PostgreSQL |
| `DB_USER` | `lumiere` | Пользователь БД |
| `DB_PASS` | `lumiere123` | Пароль БД |
| `DB_NAME` | `lumiere` | Имя базы данных |
| `TORRSERVER_URL`| `http://torrserver:8590` | Адрес сервиса TorrServer для стриминга торрентов |
| `JACRED_URL` | `http://ns3bg91xvuqfvq9h.cfhttp.top` | Адрес торрент-парсера JacRed |
| `JWT_SECRET` | *секрет* | Секретный ключ для подписи токенов авторизации |
| `INVITE_REGISTRATION` | `true` | Регистрация новых пользователей только по инвайт-кодам |
| `ADMIN_SECRET` | *секрет* | Секретный код для генерации приглашений администратора |

> **Примечание:** TMDB-токен и прокси можно также в любой момент настроить прямо через интерфейс в разделе **Настройки → Каталог (TMDB)** без перезапуска контейнера.

---

## 📲 Клиенты для телевизоров и смартфонов

### 🤖 Android TV / Google TV / Android Mobile
Универсальный APK-пакет уже собран и готов к установке:
- **Файл в репозитории**: `Lumiere.apk`
- **Прямая загрузка с вашего сервера**: `http://<IP_СЕРВЕРА>:3500/Lumiere.apk`
- Подробные инструкции по установке через **Downloader**, флешку или **ADB**:
  📖 См. **[Руководство по установке на Android TV](ANDROID-TV-INSTALL-GUIDE.md)**

### 📺 Samsung Smart TV (Tizen)
Для телевизоров Samsung доступны несколько вариантов:
1. **Media Station X (MSX)** — *Самый простой способ (1 минута без ПК)*:
   - Установите приложение **Media Station X** из официального магазина Samsung Apps.
   - В меню *Settings → Start Parameter* укажите: `<IP_СЕРВЕРА>:3500/msx`
2. **Нативный пакет (.wgt)**:
   - Файл `Lumiere.wgt` можно установить через Tizen Studio или утилиту SDB.
3. **Браузер ТВ**:
   - Откройте встроенный браузер и перейдите на `http://<IP_СЕРВЕРА>:3500/tv/`
- 📖 См. подробнее **[Руководство по установке на Samsung Tizen](TIZEN-INSTALL-GUIDE.md)**

---

## 🛠️ Ручная установка (Без Docker)

Если вы хотите запустить проект локально для разработки:

### Требования:
- **Node.js** 20+ и **npm**
- **PostgreSQL** 14+
- **FFmpeg** и **FFprobe** в системном `PATH`
- **TorrServer** (MatriX) запущенный на порту `8590`

### Шаги установки:

```bash
# 1. Клонирование и установка зависимостей
git clone https://github.com/Artrax90/lumiere.git
cd lumiere

# Установка зависимостей бэкенда и фронтенда
cd back && npm install
cd ../front && npm install
cd ..

# 2. Настройка окружения
cp .env.example back/.env
# Укажите параметры вашей локальной PostgreSQL в back/.env

# 3. Сборка фронтенда
cd front && npm run build
cd ..

# 4. Сборка и запуск бэкенда
cd back
npm run build
node dist/index.js
```

Сервер будет доступен по адресу: `http://localhost:3500`.

Для быстрого запуска в Windows можно использовать готовый скрипт:
```cmd
start.bat
```

---

## 🏛️ Архитектура проекта

```text
lumiere/
├── docker-compose.yml          # Оркестрация контейнеров (Postgres, TorrServer, Lumiere)
├── Dockerfile                  # Многоэтапная сборка приложения (Node 20 + FFmpeg)
├── .env.example                # Шаблон конфигурации без секретов
├── Lumiere.apk                 # Готовый релизный Android TV / Mobile APK
├── Lumiere.wgt                 # Готовый пакет для Samsung Smart TV (Tizen)
├── back/                       # Серверная часть (Fastify + TypeScript)
│   ├── src/
│   │   ├── db/                 # Миграции и пул подключений PostgreSQL
│   │   ├── routes/             # REST API: auth, movies, tv, torrents, iptv, sessions
│   │   ├── services/           # TMDB клиент, HLS-транскодер FFmpeg, JacRed
│   │   └── index.ts            # Точка входа сервера Fastify
│   └── public/                 # Скомпилированные статические файлы веб-клиента и TV
├── front/                      # Веб-клиент и интерфейс (React 18 + Vite + Tailwind)
│   ├── src/
│   │   ├── components/         # Hero, Player, MovieDetails, TorrentSearch, IPTVView...
│   │   ├── contexts/           # AuthContext (управление профилями и сессиями)
│   │   └── tv/                 # Компоненты D-Pad навигации и фокуса
│   ├── tizen/                  # Клиент для Samsung Smart TV (Tizen OS 5.5+)
│   └── android/                # Проект Capacitor для Android TV и смартфонов
└── docs/
    ├── ANDROID-TV-INSTALL-GUIDE.md  # Инструкция по установке Android TV APK
    └── TIZEN-INSTALL-GUIDE.md       # Инструкция по запуску на Samsung Smart TV
```

---

## 📄 Лицензия

MIT License. Свободно для личного и домашнего использования.
Проект создан для удобного управления собственной медиатекой и семейного просмотра.

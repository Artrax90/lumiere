# Movie Digital Release Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tracking for movie digital releases (WEB-DL/BDRip with clean Russian audio, strictly filtering out screeners/CAM/Line audio), notifying users via in-app bell notification and Telegram bot with 1-click play/download actions.

**Architecture:**
- Extend subscriptions in PostgreSQL (`series_subscriptions` with `media_type: 'movie'`).
- Add movie digital release detector with strict video quality & clean audio filters in `back/src/routes/notifications.ts`.
- Integrate into background 20-minute scheduler and trigger Telegram notification via `back/src/services/telegram.ts`.
- Add tracking button `🔔` to movie detail cards on TV (`tv.js`), Web, and Mobile (`MovieDetails.tsx`), plus auto-tracking when adding unreleased movies to Favorites.
- Maintain existing callback data format (`tv_play:movie:{id}` and `dl_server:movie:{id}`) so `bot/main.py` download logic remains 100% untouched.

**Tech Stack:** TypeScript, Node.js/Fastify, PostgreSQL, JacRed/Rutor API, Telegram Bot API (aiogram/node-fetch), Vanilla JS (Tizen TV), React (Web/Mobile).

---

## Global Constraints
- STRICTLY FORBIDDEN to delete any data on the server (`rm`, `rm -rf`, `docker rm`, `truncate`, `drop table`, etc.) without explicit user permission.
- Always keep `front/tizen/` and `back/public/tv/` files 100% synchronized.
- Always rebuild all client apps (`Lumiere.wgt`, `Lumiere.apk`, `Lumiere-tv.apk`) and sync to server container `lumiere-app`.
- Do NOT modify the download logic of Telegram button `dl_server` in `bot/main.py`.

---

### Task 1: Database Migration & Schema Support for Movie Subscriptions

**Files:**
- Modify: `back/src/db/migrations.sql:147-160`
- Modify: `back/src/db/pool.ts:548-600`
- Test: `scratch/test_db_subscriptions.cjs`

**Interfaces:**
- Consumes: PostgreSQL `pool`
- Produces: `series_subscriptions` table supporting `media_type` ('movie' | 'tv'), `target_quality` ('digital'), and `is_notified` (BOOLEAN).

- [ ] **Step 1: Write migration statement in migrations.sql**
Add non-destructive `ALTER TABLE series_subscriptions ADD COLUMN IF NOT EXISTS media_type VARCHAR(50) DEFAULT 'tv';` and `is_notified` / `target_quality`.

- [ ] **Step 2: Update fallback DB in pool.ts**
Ensure `pool.ts` memory fallback supports `media_type` and `is_notified` in SELECT, INSERT, UPDATE.

- [ ] **Step 3: Write test script to verify DB columns and queries**
Verify inserting and querying a movie subscription.

- [ ] **Step 4: Commit**
`git commit -m "feat(db): add media_type and is_notified support to subscriptions"`

---

### Task 2: Movie Digital Release Quality & Clean Audio Detector

**Files:**
- Modify: `back/src/routes/notifications.ts`
- Test: `scratch/test_movie_detector.cjs`

**Interfaces:**
- Produces: `detectMovieDigitalRelease(title: string, year?: number): Promise<{ isDigital: boolean; quality?: string; audio?: string; torrentTitle?: string }>`
- Video rules:
  - Allowed: `WEB-DL`, `WEBRip`, `BDRip`, `BluRay`, `Remux`, `HDTV`, `1080p`, `2160p`, `4K`.
  - Disallowed: `CAM`, `CAMRip`, `HDCAM`, `TS`, `TeleSync`, `TC`, `TeleCine`.
- Audio rules:
  - Disallowed (screen audio): `\bLine\b`, `звук с TS`, `звук с CAM`, `звук с экран`, `звук: TS`, `Line/`.
  - Allowed (clean Russian): `Дублированный`, `DUB`, `Чистый звук`, `Лицензия`, `iTunes`, `Кинопоиск`, `Okko`, `Иви`, `Профессиональный`, `МВО`, `RHS`, `Red Head Sound`, `Flarrow`.

- [ ] **Step 1: Write unit test in scratch script with sample torrent titles**
Test titles like:
  - `Человек-паук (2026) CAMRip 1080p` -> `isDigital: false`
  - `Человек-паук (2026) WEB-DL 2160p Line` -> `isDigital: false` (audio is Line!)
  - `Человек-паук (2026) WEB-DL 1080p | DUB [Чистый звук]` -> `isDigital: true`

- [ ] **Step 2: Implement `detectMovieDigitalRelease` in notifications.ts**
Fetch releases from JacRed mirrors, apply regex filter, check file size >= 2.2 GB.

- [ ] **Step 3: Run scratch test and verify all cases pass**

- [ ] **Step 4: Commit**
`git commit -m "feat(notifications): implement movie digital release quality detector"`

---

### Task 3: Background Scheduler & Telegram Dispatch for Movie Releases

**Files:**
- Modify: `back/src/routes/notifications.ts`
- Modify: `back/src/services/telegram.ts`
- Test: `scratch/test_movie_notify.cjs`

**Interfaces:**
- Produces: `checkMovieDigitalReleases(targetUserId?: number)`
- Produces: `notifyMovieDigitalRelease(userId, title, quality, audio, posterUrl, actionData)`

- [ ] **Step 1: Implement `notifyMovieDigitalRelease` in telegram.ts**
Format photo message with movie title, quality, clean audio, and existing callbacks:
`tv_play:movie:{movieId}` and `dl_server:movie:{movieId}`.

- [ ] **Step 2: Implement `checkMovieDigitalReleases` in notifications.ts**
Fetch unnotified movie subscriptions (`media_type = 'movie' AND is_notified = false`), detect digital release, create in-app notification in `notifications` table, call `notifyMovieDigitalRelease`, and update `is_notified = true`.

- [ ] **Step 3: Connect to `startNotificationScheduler` and `GET /api/notifications`**
Ensure background checker periodically runs every 20 minutes for movies as well as series.

- [ ] **Step 4: Update subscription endpoints in notifications.ts**
Update `POST /api/notifications/subscribe`, `GET /api/notifications/is-subscribed/:tmdbId`, and `POST /api/notifications/unsubscribe` to accept `mediaType` ('movie' | 'tv').

- [ ] **Step 5: Auto-subscribe on Favorites**
In `back/src/routes/user.ts` or favorites toggle, when adding a movie to favorites, auto-subscribe if movie is not already digital.

- [ ] **Step 6: Commit**
`git commit -m "feat(notifications): add movie release background scheduler and telegram alerts"`

---

### Task 4: TV UI (`front/tizen/tv.js` and `back/public/tv/tv.js`) Integration

**Files:**
- Modify: `front/tizen/tv.js`
- Modify: `back/public/tv/tv.js`

**Interfaces:**
- In movie detail modal: display `detail-track-btn` (🔔) for movies.
- Check `/api/notifications/is-subscribed/:id?mediaType=movie` and toggle subscription on click with toast feedback.

- [ ] **Step 1: Update `renderDetail` to render `detail-track-btn` for movies as well as TV**
For movies: `title="Уведомить о цифровом релизе"`.

- [ ] **Step 2: Update click handler and status fetch in `tv.js`**
Handle `mediaType: d.type || 'movie'`. Show toast: "🔔 Сообщим, когда фильм выйдет в хорошем качестве с чистым звуком" upon subscribing.

- [ ] **Step 3: Sync `front/tizen/tv.js` and `back/public/tv/tv.js`**
Ensure syntax checks pass (`node -c`) and file hashes match.

- [ ] **Step 4: Commit**
`git commit -m "feat(tv): add digital release tracking button to movie cards"`

---

### Task 5: Web & Mobile UI (`front/src/components/MovieDetails.tsx`) Integration

**Files:**
- Modify: `front/src/components/MovieDetails.tsx`

**Interfaces:**
- Display track button for movies in React UI.

- [ ] **Step 1: Update `MovieDetails.tsx` to display notification bell button for movies**
Call `/api/notifications/is-subscribed/:id?mediaType=movie`.

- [ ] **Step 2: Handle click to subscribe/unsubscribe**
Send `mediaType: 'movie'` in POST request.

- [ ] **Step 3: Commit**
`git commit -m "feat(web): enable release tracking button on movie details"`

---

### Task 6: Packaging, TV Installation, Server Deployment & Verification

**Files:**
- Package: `Lumiere.wgt`
- Build: `Lumiere.apk`, `Lumiere-tv.apk`
- Server Deploy: `scratch/deploy_all.cjs`

- [ ] **Step 1: Build Tizen package**
`tizen.bat package -t wgt -s LumiereSamsungProfile -- front/tizen`
Copy to root and `back/public/tv/Lumiere.wgt`.

- [ ] **Step 2: Install and launch on Samsung TV**
`sdb push`, `vd_appinstall`, `was_execute`.

- [ ] **Step 3: Rebuild and sign Android APKs**
`node scratch/build_apk.js`.

- [ ] **Step 4: Deploy all files to server container `lumiere-app`**
`node scratch/deploy_all.cjs`.

- [ ] **Step 5: Verify live endpoints and functionality**
Verify server responds correctly to subscribe/unsubscribe for movies and checker runs without errors.

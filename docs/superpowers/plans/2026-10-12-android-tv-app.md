# Native Android TV App (Lumiere TV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance native Android TV application for Lumiere using Kotlin, Jetpack Compose for TV, and Google Media3 (ExoPlayer), delivering 100% feature parity with the current app while eliminating WebView stutter and enabling hardware 4K HDR playback and audio passthrough.

**Architecture:** Multi-module Android project (`:core` for domain models, Retrofit API client, network discovery, and player controllers; `:tv` for Compose for TV UI and screens). Clean separation between data repositories, ViewModels, and Compose UI with D-pad navigation.

**Tech Stack:** Kotlin 2.0+, Android Gradle Plugin 8.7+, Jetpack Compose for TV (Material 3 TV), Google Media3 ExoPlayer 1.4+, Retrofit 2 + OkHttp 4 + KotlinX Serialization, Coil 3.

**Spec:** [docs/superpowers/specs/2026-10-12-android-tv-design.md](file:///c:/antigravity/project/lumiere/docs/superpowers/specs/2026-10-12-android-tv-design.md)

## Global Constraints

- Android Min SDK: `21` (Android 5.0 Lollipop).
- Android Target/Compile SDK: `35` (Android 15).
- UI Framework: Jetpack Compose for TV (`androidx.tv.material3`, `androidx.tv.foundation`).
- Video Engine: Google Media3 ExoPlayer with hardware `MediaCodec` and multi-channel audio passthrough.
- Build artifact must produce `Lumiere-tv.apk` placed in project root and `back/public/apk/` adhering to `GEMINI.md`.
- No destructive server commands (`rm -rf`, `docker rm`, etc.) under any circumstances.

---

### Task 1: Project Scaffolding & Gradle Multi-Module Setup

**Files:**
- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle.properties`
- Create: `android/core/build.gradle.kts`
- Create: `android/tv/build.gradle.kts`
- Create: `android/tv/src/main/AndroidManifest.xml`
- Create: `android/core/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: Java 17/21 from `C:\Program Files\Android\Android Studio\jbr`, Android SDK from `C:\Users\Artrax\AppData\Local\Android\Sdk`.
- Produces: Compilable Gradle project with `:core` and `:tv` modules.

- [x] **Step 1: Create Gradle root and module build scripts**
  Configure root `settings.gradle.kts` including `:core` and `:tv`. Configure `build.gradle.kts` with Kotlin and Android Gradle Plugin 8.7+. Configure `gradle.properties` with AndroidX and Compose compiler flags.
- [x] **Step 2: Install Gradle Wrapper 8.9+ in `android/`**
  Run Gradle wrapper setup using bundled Java and verify wrapper files exist.
- [x] **Step 3: Add dependencies in `core/build.gradle.kts` and `tv/build.gradle.kts`**
  Add Retrofit, OkHttp, KotlinX Serialization, Media3, Compose for TV, and Coil dependencies.
- [x] **Step 4: Verify initial build**
  Run: `cd android && ./gradlew :tv:tasks` and verify build config succeeds without errors.
- [x] **Step 5: Commit**
  ```bash
  git add android/
  git commit -m "feat(android): scaffold multi-module project structure with Gradle wrapper"
  ```

---

### Task 2: Core Domain Models, API Service & Local Subnet Discovery

**Files:**
- Create: `android/core/src/main/java/com/lumiere/core/model/Models.kt`
- Create: `android/core/src/main/java/com/lumiere/core/network/LumiereApiService.kt`
- Create: `android/core/src/main/java/com/lumiere/core/network/ServerDiscovery.kt`
- Create: `android/core/src/main/java/com/lumiere/core/network/NetworkClient.kt`
- Create: `android/core/src/test/java/com/lumiere/core/network/LumiereApiTest.kt`

**Interfaces:**
- Consumes: Fastify backend endpoints at `/api/health`, `/api/profiles`, `/api/movies`, `/api/tv`, `/api/torrents`, `/api/iptv`.
- Produces: `LumiereApiService` Retrofit client, `ServerDiscovery.discoverLocalServer()` returning server base URL.

- [x] **Step 1: Write unit tests for API serialization**
  Test JSON parsing of `Profile`, `Movie`, `Series`, `Torrent`, `IptvChannel` against actual mock responses from Lumiere backend.
- [x] **Step 2: Implement data models in `Models.kt`**
  Create `@Serializable` data classes matching backend schema.
- [x] **Step 3: Implement `LumiereApiService` in Retrofit**
  Define endpoints for profiles, catalog, torrents, sessions heartbeat, history, and IPTV.
- [x] **Step 4: Implement `ServerDiscovery`**
  Scan local subnet `/24` on port `3500` with 300ms parallel health check probe.
- [x] **Step 5: Run unit tests**
  Run: `cd android && ./gradlew :core:test` and ensure all tests pass.
- [x] **Step 6: Commit**
  ```bash
  git add android/core/
  git commit -m "feat(core): implement domain models, Retrofit API service and local server discovery"
  ```

---

### Task 3: Preferences, Dark Gold Theme & TV Navigation Architecture

**Files:**
- Create: `android/core/src/main/java/com/lumiere/core/storage/AppPreferences.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/theme/Color.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/theme/Theme.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/theme/Type.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/navigation/Screen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/MainActivity.kt`

**Interfaces:**
- Consumes: `:core` storage & models.
- Produces: Navigation host supporting deep routes (`Connect`, `Profiles`, `Home`, `Details`, `Player`, `Iptv`, `Search`).

- [x] **Step 1: Implement `AppPreferences`**
  Store and retrieve `serverUrl`, `currentProfileId`, `lastWatchedMedia`.
- [x] **Step 2: Implement Lumiere Dark Gold Theme for TV**
  Define `Gold = Color(0xFFE8C170)`, `BackgroundDark = Color(0xFF07090E)`, `SurfaceDark = Color(0xFF0F121C)` with Compose Material 3 TV theme.
- [x] **Step 3: Implement `Screen` sealed navigation class and `MainActivity`**
  Setup `NavHost` with D-pad back navigation handling.
- [x] **Step 4: Verify compilation**
  Run: `cd android && ./gradlew :tv:compileDebugKotlin`.
- [x] **Step 5: Commit**
  ```bash
  git add android/tv/src/main/java/com/lumiere/tv/
  git commit -m "feat(tv): add dark gold TV design theme, preferences and navigation graph"
  ```

---

### Task 4: Server Discovery Screen & Profile Picker with PIN Modal

**Files:**
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/connect/ConnectScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/connect/ConnectViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/profiles/ProfilesScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/profiles/ProfilesViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/PinDialog.kt`

**Interfaces:**
- Consumes: `ServerDiscovery`, `LumiereApiService.getProfiles()`, `verifyPin()`.
- Produces: Profile selection and server connection routes.

- [x] **Step 1: Implement `ConnectScreen` and `ConnectViewModel`**
  Display scanning pulse indicator. If server detected, show one-click connect button. Fallback to D-pad IP/port editor.
- [x] **Step 2: Implement `ProfilesScreen` and `ProfilesViewModel`**
  Fetch `/api/profiles`. Render animated TV profile cards with golden glow on D-pad focus.
- [x] **Step 3: Implement `PinDialog` for TV**
  Modal 4-digit PIN pad with numeric buttons, error shake animation, and auto-submit on 4th digit.
- [x] **Step 4: Verify compilation & layout**
  Run: `cd android && ./gradlew :tv:compileDebugKotlin`.
- [x] **Step 5: Commit**
  ```bash
  git add android/tv/src/main/java/com/lumiere/tv/ui/connect android/tv/src/main/java/com/lumiere/tv/ui/profiles android/tv/src/main/java/com/lumiere/tv/ui/components
  git commit -m "feat(tv): implement server connect screen and profile picker with PIN dialog"
  ```

---

### Task 5: Home Screen: Hero Banner, Continue Watching & Media Carousels

**Files:**
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/home/HomeScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/home/HomeViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/HeroBanner.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/MediaCard.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/MediaRow.kt`

**Interfaces:**
- Consumes: `/api/movies/trending`, `/api/history`, `/api/movies`, `/api/tv`.
- Produces: Main interactive catalog browse UI.

- [ ] **Step 1: Implement `MediaCard` with TV focus scale**
  16:9 or 2:3 card with Coil image loading, title, rating badge, and 1.06x focus scale with gold outline.
- [ ] **Step 2: Implement `HeroBanner`**
  Full-bleed top banner with backdrop image, title, genres, rating, and "Watch" / "Details" action buttons.
- [ ] **Step 3: Implement `MediaRow`**
  Horizontal scrolling `LazyRow` with `TvLazyRow` optimizing D-pad focus transition.
- [ ] **Step 4: Implement `HomeScreen` and `HomeViewModel`**
  Assemble Hero Banner, Continue Watching row with percent bar, Trending Movies, New Series, Top of Week.
- [ ] **Step 5: Verify build**
  Run: `cd android && ./gradlew :tv:assembleDebug`.
- [ ] **Step 6: Commit**
  ```bash
  git add android/tv/src/main/java/com/lumiere/tv/ui/home/ android/tv/src/main/java/com/lumiere/tv/ui/components/
  git commit -m "feat(tv): implement TV home screen with hero banner and horizontal media carousels"
  ```

---

### Task 6: Media Detail Screen: Trailers, Seasons, Episodes & TorrServer Dialog

**Files:**
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/details/DetailsScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/details/DetailsViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/TorrentDialog.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/SeasonPicker.kt`

**Interfaces:**
- Consumes: `/api/movies/:id`, `/api/tv/:id`, `/api/torrents/search`.
- Produces: Detailed view with trailer playback, episode picker, and torrent selection.

- [ ] **Step 1: Implement `DetailsViewModel`**
  Fetch item details, cast list, trailers, episodes, and search torrent releases.
- [ ] **Step 2: Implement `DetailsScreen` layout**
  High-res backdrop background, metadata badges (Kinopoisk, IMDb, Year, Duration), action buttons.
- [ ] **Step 3: Implement `SeasonPicker` and Episode Grid**
  Season tab selector and horizontal episode cards with preview thumbnail and description.
- [ ] **Step 4: Implement `TorrentDialog`**
  List available torrents with resolution badge (4K HDR, 1080p), voiceover tags (Dub, NewStudio), seeds, size, and one-click launch via TorrServer.
- [ ] **Step 5: Verify build**
  Run: `cd android && ./gradlew :tv:assembleDebug`.
- [ ] **Step 6: Commit**
  ```bash
  git add android/tv/src/main/java/com/lumiere/tv/ui/details/
  git commit -m "feat(tv): implement media detail screen with trailer, seasons and torrent picker"
  ```

---

### Task 7: Google Media3 ExoPlayer Engine & TV Playback Controls

**Files:**
- Create: `android/core/src/main/java/com/lumiere/core/player/LumierePlayer.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/player/PlayerScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/player/PlayerViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/player/PlayerControlsOverlay.kt`

**Interfaces:**
- Consumes: Direct video URLs, HLS playlists, TorrServer stream URLs.
- Produces: Fullscreen video playback with hardware acceleration, audio track switching, subtitle picker, and progress sync.

- [ ] **Step 1: Implement `LumierePlayer` wrapping Media3 ExoPlayer**
  Configure `DefaultRenderersFactory` with `EXTENSION_RENDERER_MODE_ON`, hardware `MediaCodec`, audio passthrough flags, and OkHttp data source.
- [ ] **Step 2: Implement `PlayerControlsOverlay`**
  On-screen TV HUD shown on D-pad interaction:
  - Play/Pause toggle, progress seekbar with current/total time.
  - Audio tracks dialog (`▲`).
  - Subtitle track dialog (`▲`).
  - Next/Previous episode navigation.
  - TorrServer buffer stats banner (peers, speed MB/s, buffer %).
- [ ] **Step 3: Implement `PlayerScreen` & `PlayerViewModel`**
  Handle D-pad events (`KEYCODE_DPAD_CENTER`, `KEYCODE_MEDIA_PLAY_PAUSE`, `KEYCODE_DPAD_LEFT`/`RIGHT` seek).
  Periodic 10s heartbeat to `/api/sessions/heartbeat` and save progress on exit.
- [ ] **Step 4: Verify build**
  Run: `cd android && ./gradlew :tv:assembleDebug`.
- [ ] **Step 5: Commit**
  ```bash
  git add android/core/src/main/java/com/lumiere/core/player/ android/tv/src/main/java/com/lumiere/tv/ui/player/
  git commit -m "feat(tv): implement Media3 ExoPlayer engine with TV D-pad controls and audio passthrough"
  ```

---

### Task 8: IPTV Television Screen with EPG & Instant Channel Switch

**Files:**
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/iptv/IptvScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/iptv/IptvViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/iptv/EpgSidebar.kt`

**Interfaces:**
- Consumes: `/iptv/playlist.m3u`, `/api/iptv/epg`.
- Produces: Live TV channels browsing, EPG guide, and fast channel zap.

- [ ] **Step 1: Implement `IptvViewModel`**
  Fetch channels, group by category, load EPG schedule.
- [ ] **Step 2: Implement `EpgSidebar`**
  Category tabs, channel list with logos, current program title and progress indicator.
- [ ] **Step 3: Implement `IptvScreen`**
  Fullscreen live playback with channel sidebar overlay. D-pad `▲`/`▼` triggers instant next/previous channel switch.
- [ ] **Step 4: Verify build**
  Run: `cd android && ./gradlew :tv:assembleDebug`.
- [ ] **Step 5: Commit**
  ```bash
  git add android/tv/src/main/java/com/lumiere/tv/ui/iptv/
  git commit -m "feat(tv): implement IPTV player with category filter and EPG program guide"
  ```

---

### Task 9: Search Screen with On-Screen TV Virtual Keyboard

**Files:**
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/search/SearchScreen.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/search/SearchViewModel.kt`
- Create: `android/tv/src/main/java/com/lumiere/tv/ui/components/TvVirtualKeyboard.kt`

**Interfaces:**
- Consumes: `/api/movies?q=...`.
- Produces: Fast search interface optimized for remote controls.

- [ ] **Step 1: Implement `TvVirtualKeyboard`**
  Russian + English + Digits layout with Backspace, Space, and Clear keys.
- [ ] **Step 2: Implement `SearchViewModel`**
  Debounced search queries (350ms) to backend API.
- [ ] **Step 3: Implement `SearchScreen`**
  Side-by-side layout: keyboard on left, live results grid on right with focus transition.
- [ ] **Step 4: Verify build**
  Run: `cd android && ./gradlew :tv:assembleDebug`.
- [ ] **Step 5: Commit**
  ```bash
  git add android/tv/src/main/java/com/lumiere/tv/ui/search/
  git commit -m "feat(tv): implement TV search screen with on-screen remote keyboard"
  ```

---

### Task 10: Release Packaging, Server Sync & ADB TV Deployment Pipeline

**Files:**
- Create: `scratch/build_native_tv.cjs`
- Modify: `GEMINI.md:12-25` (Update build rules for native TV APK)

**Interfaces:**
- Consumes: Gradle build outputs.
- Produces: Signed `Lumiere-tv.apk` in root and `back/public/apk/Lumiere-tv.apk`, deployed to server and installable via ADB.

- [ ] **Step 1: Create `scratch/build_native_tv.cjs`**
  Executes `./gradlew :tv:assembleRelease` (or `assembleDebug`), signs APK, copies to root `Lumiere-tv.apk` and `back/public/apk/Lumiere-tv.apk`.
- [ ] **Step 2: Add auto-install via ADB / SDB if TV is connected**
  Support `adb install -r Lumiere-tv.apk` for connected Android TV devices.
- [ ] **Step 3: Test full packaging pipeline**
  Run: `node scratch/build_native_tv.cjs` and verify APK is created, signed, and placed in target locations.
- [ ] **Step 4: Commit**
  ```bash
  git add scratch/build_native_tv.cjs GEMINI.md
  git commit -m "feat(build): add native Android TV build, sign and deployment pipeline"
  ```

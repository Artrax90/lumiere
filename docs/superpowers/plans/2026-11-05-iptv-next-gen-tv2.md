# IPTV Next-Gen (v2) Implementation Plan

> **Goal:** Port WGT-style next-gen IPTV capabilities to Android TV v2 (`com.lumiere.tv2`): 3-column guide with live video preview, real-time EPG progress, upcoming schedule, channel favorites, and 50/50 Multi-View dual playback. Strictly leave v1 untouched.

## Architecture & Design
1. **3-Column Guide Screen (`IptvScreen.kt` in `tv2`)**:
   - **Column 1 (`240dp`)**: Vertical list of categories ("★ Избранное", "Все каналы", and playlist groups with counts).
   - **Column 2 (`380dp`)**: Vertical list of channels in the selected category with logo, name, category badge, live program name, and favorite star. Focus debounces preview loading.
   - **Column 3 (Flexible remainder)**:
     - 16:9 Live Video Preview Box with `AndroidView(PlayerView)` bound to `IptvViewModel.player` (muted).
     - Channel Header: Large logo, pulsing live dot `● В ЭФИРЕ`, channel title, category pill.
     - Current Program Card: Title, time range (`19:00 — 20:30`), live gold progress bar (`(now - start) / (stop - start)`), description.
     - Action buttons: `[▶ На весь экран]`, `[♡ В избранное]`, `[⧉ Мульти-экран]`.
     - Upcoming Schedule: Next 4-6 programs with start times.
2. **Instant Zero-Gap Fullscreen Transition**:
   - `player.exoPlayer` is reused directly between preview and fullscreen mode: expanding to fullscreen simply un-mutes audio (`volume = 1f`) and sets `isPlayerMode = true` without reloading the stream! Exiting fullscreen simply sets `volume = 0f` and returns to the 3-column guide.
3. **50/50 Multi-View Dual Player**:
   - When Multi-View is enabled, screen splits into two 50% halves (Channel A on primary player, Channel B on secondary player).
   - D-pad Left / Right switches audio focus with visual gold border and bottom indicator badge.
   - Pressing OK expands focused channel to single-channel fullscreen.
4. **Favorites Persistence**:
   - Set of favorite channel IDs stored in preferences / local state, pinned as top category.

## File Changes Scope
- **`android/tv2/src/main/java/com/lumiere/tv/ui/iptv/IptvViewModel.kt`**:
  - Add `focusedChannel`, `currentProgramDetail`, `upcomingSchedule`, `currentProgramProgress`, `favoriteIds`, `isMultiViewMode`, `secondaryPlayer`, `multiViewAudioOnPrimary`.
  - Add debounced preview stream loader (`focusChannel`).
  - Add `toggleFavorite(channelId)`, `enterFullscreen()`, `toggleMultiView()`, `switchMultiViewAudio()`.
- **`android/tv2/src/main/java/com/lumiere/tv/ui/iptv/IptvScreen.kt`**:
  - Replace simple grid with 3-column WGT layout.
  - Implement preview video box, live EPG progress bar, upcoming schedule list, action buttons.
  - Implement Multi-View 50/50 dual screen mode.
- **Verification**:
  - Build `:tv2` release APK with `node scratch/build_native_tv_v2.cjs`.
  - Copy APK to root and server `/app/public/`.
  - Verify on Android TV device `192.168.1.128:5555`.

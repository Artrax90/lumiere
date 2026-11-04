package com.lumiere.tv.ui.player

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.isActive

private fun Context.findActivity(): Activity? {
    var ctx = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    streamUrl: String,
    title: String,
    subtitle: String,
    isHls: Boolean,
    mediaId: Long = 0L,
    mediaType: String = "movie",
    season: Int = 0,
    episode: Int = 0,
    startPositionMs: Long = 0L,
    poster: String = "",
    onBackClick: () -> Unit,
    viewModel: PlayerViewModel = viewModel()
) {
    val player = viewModel.player
    val uiState by viewModel.uiState.collectAsState()

    val isPlaying by player.isPlaying.collectAsState()
    val positionMs by player.positionMs.collectAsState()
    val durationMs by player.durationMs.collectAsState()
    val bufferedMs by player.bufferedMs.collectAsState()
    val playbackState by player.playbackState.collectAsState()
    val audioTracks by player.audioTracks.collectAsState()
    val subtitleTracks by player.subtitleTracks.collectAsState()

    val focusRequester = remember { FocusRequester() }

    val displayTitle = if (uiState.currentTitle.isNotBlank()) uiState.currentTitle else title
    val displaySubtitle = if (uiState.currentSubtitle.isNotBlank()) uiState.currentSubtitle else subtitle

    var activeZone by remember { mutableStateOf(PlayerZone.TIMELINE) }
    var bottomBtnIndex by remember { mutableIntStateOf(2) } // 2 is Play/Pause
    var popupType by remember { mutableStateOf<String?>(null) } // "audio", "subs", or null
    var popupIndex by remember { mutableIntStateOf(0) }
    var nextEpBtnIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(uiState.showNextEpisodePrompt) {
        if (uiState.showNextEpisodePrompt) {
            nextEpBtnIndex = 0
        }
    }

    val hasAudio = audioTracks.isNotEmpty()
    val hasSubs = subtitleTracks.isNotEmpty()
    val audioBtnIndex = if (hasAudio) 5 else -1
    val subBtnIndex = if (hasSubs) (if (hasAudio) 6 else 5) else -1
    val totalBottomButtons = 5 + (if (hasAudio) 1 else 0) + (if (hasSubs) 1 else 0)

    val context = LocalContext.current

    DisposableEffect(Unit) {
        val window = context.findActivity()?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window?.decorView?.keepScreenOn = true
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            window?.decorView?.keepScreenOn = false
        }
    }

    LaunchedEffect(playbackState) {
        if (playbackState == androidx.media3.common.Player.STATE_ENDED && mediaType == "tv") {
            viewModel.nextEpisodeOrEnd()
        }
    }

    LaunchedEffect(isPlaying) {
        val window = context.findActivity()?.window
        while (isActive) {
            if (isPlaying) {
                window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                window?.decorView?.keepScreenOn = true
            }
            kotlinx.coroutines.delay(20_000L)
        }
    }

    LaunchedEffect(title, subtitle) {
        viewModel.setInitialMetadata(title, subtitle)
    }

    LaunchedEffect(streamUrl) {
        viewModel.playStream(streamUrl, isHls, startPositionMs, mediaId, mediaType, season, episode)
        viewModel.startPeriodicProgressSaving(mediaId, mediaType, title, poster, season, episode)
        focusRequester.requestFocus()
    }

    val handleBack: () -> Unit = {
        try {
            player.pause()
        } catch (_: Throwable) {}
        viewModel.saveWatchProgress(mediaId, mediaType, title, poster, season, episode)
        onBackClick()
    }

    BackHandler {
        if (uiState.showNextEpisodePrompt) {
            viewModel.dismissNextEpisodePrompt()
        } else if (popupType != null) {
            popupType = null
            viewModel.scheduleControlsHide(5000L)
        } else if (uiState.isControlsVisible) {
            viewModel.hideControls()
        } else {
            handleBack()
        }
    }

    LaunchedEffect(uiState.isControlsVisible) {
        focusRequester.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val code = keyEvent.nativeKeyEvent.keyCode

                // Hardware media keys - work in all modes
                when (code) {
                    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                        player.togglePlayPause()
                        viewModel.showControls()
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_PLAY -> {
                        player.play()
                        viewModel.showControls()
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                        player.pause()
                        viewModel.showControls()
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_STEP_FORWARD -> {
                        viewModel.onUserSeek(10000L)
                        viewModel.showControls()
                        activeZone = PlayerZone.TIMELINE
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_REWIND, KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD -> {
                        viewModel.onUserSeek(-10000L)
                        viewModel.showControls()
                        activeZone = PlayerZone.TIMELINE
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                        viewModel.previousEpisodeOrStart()
                        viewModel.showControls()
                        activeZone = PlayerZone.BOTTOM
                        bottomBtnIndex = 0
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_NEXT -> {
                        viewModel.nextEpisodeOrEnd()
                        viewModel.showControls()
                        activeZone = PlayerZone.BOTTOM
                        bottomBtnIndex = 4
                        return@onPreviewKeyEvent true
                    }
                }

                // Next Episode Autoplay Prompt navigation (matching WGT)
                if (uiState.showNextEpisodePrompt) {
                    when (code) {
                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_UP -> {
                            nextEpBtnIndex = 0
                            return@onPreviewKeyEvent true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_DOWN -> {
                            nextEpBtnIndex = 1
                            return@onPreviewKeyEvent true
                        }
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                            if (nextEpBtnIndex == 0) {
                                viewModel.playNextEpisodeNow()
                            } else {
                                viewModel.dismissNextEpisodePrompt()
                            }
                            return@onPreviewKeyEvent true
                        }
                        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                            viewModel.dismissNextEpisodePrompt()
                            return@onPreviewKeyEvent true
                        }
                    }
                }

                // Popup (audio / subtitles chooser) is active
                if (popupType != null) {
                    when (code) {
                        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            popupType = null
                            viewModel.scheduleControlsHide(5000L)
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_UP -> {
                            popupIndex = (popupIndex - 1).coerceAtLeast(0)
                            viewModel.scheduleControlsHide(5000L)
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            val maxIdx = if (popupType == "subs") subtitleTracks.size else (audioTracks.size - 1).coerceAtLeast(0)
                            popupIndex = (popupIndex + 1).coerceAtMost(maxIdx)
                            viewModel.scheduleControlsHide(5000L)
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                            if (popupType == "audio") {
                                player.selectAudioTrack(popupIndex)
                            } else if (popupType == "subs") {
                                player.selectSubtitleTrack(popupIndex - 1)
                            }
                            popupType = null
                            viewModel.scheduleControlsHide(5000L)
                            true
                        }
                        else -> false
                    }
                } else if (!uiState.isControlsVisible) {
                    // Controls are currently hidden - any D-pad action wakes them up
                    when (code) {
                        KeyEvent.KEYCODE_BACK -> {
                            handleBack()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                            player.togglePlayPause()
                            viewModel.showControls()
                            activeZone = PlayerZone.TIMELINE
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            viewModel.onUserSeek(-10000L)
                            viewModel.showControls()
                            activeZone = PlayerZone.TIMELINE
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            viewModel.onUserSeek(10000L)
                            viewModel.showControls()
                            activeZone = PlayerZone.TIMELINE
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                            viewModel.showControls()
                            activeZone = PlayerZone.TIMELINE
                            true
                        }
                        else -> false
                    }
                } else {
                    // Controls are visible - keep alive and navigate
                    viewModel.scheduleControlsHide(5000L)

                    when (code) {
                        KeyEvent.KEYCODE_BACK -> {
                            viewModel.hideControls()
                            true
                        }
                        else -> {
                            when (activeZone) {
                                PlayerZone.TIMELINE -> {
                                    when (code) {
                                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                                            viewModel.onUserSeek(-10000L)
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                            viewModel.onUserSeek(10000L)
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                                            player.togglePlayPause()
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_UP -> {
                                            activeZone = PlayerZone.TOP
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                                            activeZone = PlayerZone.BOTTOM
                                            bottomBtnIndex = 2 // default to Play/Pause
                                            true
                                        }
                                        else -> false
                                    }
                                }
                                PlayerZone.BOTTOM -> {
                                    when (code) {
                                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                                            bottomBtnIndex = (bottomBtnIndex - 1).coerceAtLeast(0)
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                            bottomBtnIndex = (bottomBtnIndex + 1).coerceAtMost(totalBottomButtons - 1)
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_UP -> {
                                            activeZone = PlayerZone.TIMELINE
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                                            viewModel.hideControls()
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                                            when (bottomBtnIndex) {
                                                0 -> viewModel.previousEpisodeOrStart()
                                                1 -> viewModel.onUserSeek(-10000L)
                                                2 -> player.togglePlayPause()
                                                3 -> viewModel.onUserSeek(10000L)
                                                4 -> viewModel.nextEpisodeOrEnd()
                                                audioBtnIndex -> {
                                                    popupType = "audio"
                                                    val sel = audioTracks.indexOfFirst { it.isSelected }
                                                    popupIndex = if (sel >= 0) sel else 0
                                                }
                                                subBtnIndex -> {
                                                    popupType = "subs"
                                                    val sel = subtitleTracks.indexOfFirst { it.isSelected }
                                                    popupIndex = if (sel >= 0) sel + 1 else 0
                                                }
                                            }
                                            true
                                        }
                                        else -> false
                                    }
                                }
                                PlayerZone.TOP -> {
                                    when (code) {
                                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                                            activeZone = PlayerZone.TIMELINE
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_UP -> {
                                            viewModel.hideControls()
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                                            handleBack()
                                            true
                                        }
                                        else -> false
                                    }
                                }
                            }
                        }
                    }
                }
            }
    ) {
        // Fullscreen ExoPlayer Surface
        AndroidView(
            factory = { context ->
                PlayerView(context).apply {
                    this.player = player.exoPlayer
                    useController = false
                    keepScreenOn = true
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    (videoSurfaceView as? android.view.SurfaceView)?.keepScreenOn = true
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            update = { playerView ->
                playerView.keepScreenOn = true
                (playerView.videoSurfaceView as? android.view.SurfaceView)?.keepScreenOn = true
            },
            onRelease = { playerView ->
                playerView.keepScreenOn = false
                playerView.player = null
            },
            modifier = Modifier.fillMaxSize()
        )

        // Central Buffering / Loading Overlay - instant, zero transition lag
        val isBuffering = playbackState == Player.STATE_BUFFERING || uiState.isSwitchingEpisode
        if (isBuffering) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xDD07090E))
                    .border(1.dp, com.lumiere.tv.theme.LumiereGoldGlow, RoundedCornerShape(16.dp))
                    .padding(horizontal = 32.dp, vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    androidx.compose.material3.CircularProgressIndicator(
                        color = com.lumiere.tv.theme.LumiereGold,
                        modifier = Modifier.size(42.dp),
                        strokeWidth = 3.dp
                    )

                    androidx.tv.material3.Text(
                        text = displayTitle,
                        style = androidx.tv.material3.MaterialTheme.typography.titleMedium,
                        color = com.lumiere.tv.theme.TextPrimary
                    )

                    if (displaySubtitle.isNotBlank()) {
                        androidx.tv.material3.Text(
                            text = displaySubtitle,
                            style = androidx.tv.material3.MaterialTheme.typography.bodyMedium,
                            color = com.lumiere.tv.theme.TextSecondary
                        )
                    }

                    val msg = uiState.statusMessage
                    val stats = uiState.torrServerStats
                    if (!msg.isNullOrBlank()) {
                        androidx.tv.material3.Text(
                            text = msg,
                            style = androidx.tv.material3.MaterialTheme.typography.labelMedium,
                            color = com.lumiere.tv.theme.LumiereGold,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                        )
                    } else if (!stats.isNullOrBlank()) {
                        androidx.tv.material3.Text(
                            text = stats,
                            style = androidx.tv.material3.MaterialTheme.typography.labelMedium,
                            color = com.lumiere.tv.theme.LumiereGold,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                        )
                    } else {
                        androidx.tv.material3.Text(
                            text = "Подключение к раздаче и буферизация...",
                            style = androidx.tv.material3.MaterialTheme.typography.labelSmall,
                            color = com.lumiere.tv.theme.TextSecondary
                        )
                    }
                }
            }
        }

        // Dynamic Center OSD Seek Badge
        val currentSeekTarget = uiState.seekTargetMs
        if (uiState.isSeeking && currentSeekTarget != null) {
            val sign = if (uiState.seekDeltaSec > 0) "+" else ""
            val arrow = if (uiState.seekDeltaSec < 0) "◄◄" else "►►"
            val formattedTarget = formatTime(currentSeekTarget)
            val deltaText = "$arrow $sign${uiState.seekDeltaSec} сек ($formattedTarget)"
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xE605070B))
                    .border(1.5.dp, com.lumiere.tv.theme.LumiereGold, RoundedCornerShape(14.dp))
                    .padding(horizontal = 28.dp, vertical = 14.dp)
            ) {
                androidx.tv.material3.Text(
                    text = deltaText,
                    color = com.lumiere.tv.theme.LumiereGold,
                    style = androidx.tv.material3.MaterialTheme.typography.titleMedium,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )
            }
        }

        // TV Controls Overlay
        PlayerControlsOverlay(
            isVisible = uiState.isControlsVisible,
            title = displayTitle,
            subtitle = displaySubtitle,
            isPlaying = isPlaying,
            isBuffering = isBuffering,
            positionMs = if (uiState.isSeeking && currentSeekTarget != null) currentSeekTarget else positionMs,
            durationMs = durationMs,
            bufferedMs = bufferedMs,
            torrServerStats = uiState.torrServerStats,
            audioTracks = audioTracks,
            subtitleTracks = subtitleTracks,
            activeZone = activeZone,
            bottomBtnIndex = bottomBtnIndex,
            popupType = popupType,
            popupIndex = popupIndex,
            onPlayPauseClick = { player.togglePlayPause() },
            onSeekRelative = { offset -> viewModel.onUserSeek(offset) },
            onPreviousClick = { viewModel.previousEpisodeOrStart() },
            onNextClick = { viewModel.nextEpisodeOrEnd() },
            onAudioTrackSelect = { idx -> player.selectAudioTrack(idx) },
            onSubtitleTrackSelect = { idx -> player.selectSubtitleTrack(idx) },
            onOpenAudioPopup = {
                popupType = "audio"
                val sel = audioTracks.indexOfFirst { it.isSelected }
                popupIndex = if (sel >= 0) sel else 0
            },
            onOpenSubtitlePopup = {
                popupType = "subs"
                val sel = subtitleTracks.indexOfFirst { it.isSelected }
                popupIndex = if (sel >= 0) sel + 1 else 0
            },
            onClosePopup = { popupType = null },
            onBackClick = handleBack
        )

        // Next Episode Prompt Overlay (Compact TV Card)
        if (uiState.showNextEpisodePrompt && !isBuffering) {
            val bottomPad = if (uiState.isControlsVisible) 170.dp else 28.dp
            NextEpisodeOverlay(
                countdownSec = uiState.nextEpisodeCountdownSec,
                nextEpisodeTitle = uiState.nextEpisodeTitle,
                focusedIndex = nextEpBtnIndex,
                onPlayClick = { viewModel.playNextEpisodeNow() },
                onCancelClick = { viewModel.dismissNextEpisodePrompt() },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 28.dp, bottom = bottomPad)
            )
        }
    }
}

@Composable
fun NextEpisodeOverlay(
    countdownSec: Int,
    nextEpisodeTitle: String,
    focusedIndex: Int,
    onPlayClick: () -> Unit,
    onCancelClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xF00D111A))
            .border(
                width = 1.5.dp,
                color = com.lumiere.tv.theme.LumiereGold.copy(alpha = 0.6f),
                shape = RoundedCornerShape(14.dp)
            )
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .widthIn(min = 250.dp, max = 310.dp)
    ) {
        Column(
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(5.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            // Header: Dot + Label + Countdown badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(com.lumiere.tv.theme.LumiereGold)
                    )
                    androidx.tv.material3.Text(
                        text = "СЛЕДУЮЩАЯ СЕРИЯ",
                        color = com.lumiere.tv.theme.LumiereGold,
                        style = androidx.tv.material3.MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 0.8.sp
                        )
                    )
                }

                // Countdown Pill
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0x33E8C170))
                        .border(1.dp, com.lumiere.tv.theme.LumiereGold.copy(alpha = 0.5f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 1.dp)
                ) {
                    androidx.tv.material3.Text(
                        text = "${countdownSec.coerceAtLeast(0)}с",
                        color = Color.White,
                        style = androidx.tv.material3.MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black
                        )
                    )
                }
            }

            // Next Episode Title
            androidx.tv.material3.Text(
                text = nextEpisodeTitle.ifBlank { "Следующая серия" },
                color = Color(0xEEFFFFFF),
                style = androidx.tv.material3.MaterialTheme.typography.bodySmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(2.dp))

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Button 0: Play Now (Primary)
                val isPlayFocused = focusedIndex == 0
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (isPlayFocused) com.lumiere.tv.theme.LumiereGold
                            else com.lumiere.tv.theme.LumiereGold.copy(alpha = 0.2f)
                        )
                        .border(
                            width = if (isPlayFocused) 2.dp else 1.dp,
                            color = if (isPlayFocused) Color.White else com.lumiere.tv.theme.LumiereGold.copy(alpha = 0.4f),
                            shape = RoundedCornerShape(8.dp)
                        )
                        .clickable { onPlayClick() }
                        .padding(vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.tv.material3.Text(
                        text = "▶ Включить (OK)",
                        color = if (isPlayFocused) Color.Black else com.lumiere.tv.theme.LumiereGold,
                        style = androidx.tv.material3.MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        maxLines = 1
                    )
                }

                // Button 1: Cancel (Secondary)
                val isCancelFocused = focusedIndex == 1
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (isCancelFocused) Color(0x44FFFFFF)
                            else Color(0x22FFFFFF)
                        )
                        .border(
                            width = if (isCancelFocused) 2.dp else 1.dp,
                            color = if (isCancelFocused) Color.White else Color(0x33FFFFFF),
                            shape = RoundedCornerShape(8.dp)
                        )
                        .clickable { onCancelClick() }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.tv.material3.Text(
                        text = "✕ Отмена",
                        color = Color.White,
                        style = androidx.tv.material3.MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        maxLines = 1
                    )
                }
            }
        }
    }
}

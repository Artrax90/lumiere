package com.lumiere.tv.ui.player

import android.view.KeyEvent
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    streamUrl: String,
    title: String,
    subtitle: String,
    isHls: Boolean,
    mediaId: Long = 0L,
    mediaType: String = "movie",
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

    var activeZone by remember { mutableStateOf(PlayerZone.TIMELINE) }
    var bottomBtnIndex by remember { mutableIntStateOf(1) } // 1 is Play/Pause
    var popupType by remember { mutableStateOf<String?>(null) } // "audio", "subs", or null
    var popupIndex by remember { mutableIntStateOf(0) }

    val hasAudio = audioTracks.isNotEmpty()
    val hasSubs = subtitleTracks.isNotEmpty()
    val audioBtnIndex = if (hasAudio) 3 else -1
    val subBtnIndex = if (hasSubs) (if (hasAudio) 4 else 3) else -1
    val totalBottomButtons = 3 + (if (hasAudio) 1 else 0) + (if (hasSubs) 1 else 0)

    LaunchedEffect(streamUrl) {
        viewModel.playStream(streamUrl, isHls)
        focusRequester.requestFocus()
    }

    val handleBack: () -> Unit = {
        viewModel.saveWatchProgress(mediaId, mediaType)
        try {
            player.stop()
        } catch (_: Throwable) {}
        onBackClick()
    }

    BackHandler {
        if (popupType != null) {
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
                        player.seekRelative(10000L)
                        viewModel.showControls()
                        activeZone = PlayerZone.TIMELINE
                        return@onPreviewKeyEvent true
                    }
                    KeyEvent.KEYCODE_MEDIA_REWIND, KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD -> {
                        player.seekRelative(-10000L)
                        viewModel.showControls()
                        activeZone = PlayerZone.TIMELINE
                        return@onPreviewKeyEvent true
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
                            player.seekRelative(-10000L)
                            viewModel.showControls()
                            activeZone = PlayerZone.TIMELINE
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            player.seekRelative(10000L)
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
                                            player.seekRelative(-10000L)
                                            true
                                        }
                                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                            player.seekRelative(10000L)
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
                                            bottomBtnIndex = 1 // default to Play/Pause
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
                                                0 -> player.seekRelative(-10000L)
                                                1 -> player.togglePlayPause()
                                                2 -> player.seekRelative(10000L)
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
                    setBackgroundColor(android.graphics.Color.BLACK)
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    (videoSurfaceView as? android.view.SurfaceView)?.apply {
                        setZOrderMediaOverlay(true)
                    }
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            onRelease = { playerView ->
                playerView.player = null
            },
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
        )

        // Central Buffering / Loading Overlay - instant, zero transition lag
        val isBuffering = playbackState == Player.STATE_BUFFERING
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
                        text = title,
                        style = androidx.tv.material3.MaterialTheme.typography.titleMedium,
                        color = com.lumiere.tv.theme.TextPrimary
                    )

                    if (subtitle.isNotBlank()) {
                        androidx.tv.material3.Text(
                            text = subtitle,
                            style = androidx.tv.material3.MaterialTheme.typography.bodyMedium,
                            color = com.lumiere.tv.theme.TextSecondary
                        )
                    }

                    val stats = uiState.torrServerStats
                    if (!stats.isNullOrBlank()) {
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

        // TV Controls Overlay
        PlayerControlsOverlay(
            isVisible = uiState.isControlsVisible,
            title = title,
            subtitle = subtitle,
            isPlaying = isPlaying,
            isBuffering = playbackState == Player.STATE_BUFFERING,
            positionMs = positionMs,
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
            onSeekRelative = { offset -> player.seekRelative(offset) },
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
    }
}

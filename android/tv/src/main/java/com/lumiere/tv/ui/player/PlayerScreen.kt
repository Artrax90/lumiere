package com.lumiere.tv.ui.player

import android.view.KeyEvent
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
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

    LaunchedEffect(streamUrl) {
        viewModel.playStream(streamUrl, isHls)
        focusRequester.requestFocus()
    }

    val handleBack: () -> Unit = {
        viewModel.saveWatchProgress(mediaId, mediaType)
        onBackClick()
    }

    BackHandler(onBack = handleBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onKeyEvent false

                when (keyEvent.nativeKeyEvent.keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        if (!uiState.isControlsVisible) {
                            viewModel.showControls()
                        } else {
                            player.togglePlayPause()
                        }
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        player.seekRelative(-10000L)
                        viewModel.showControls()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        player.seekRelative(10000L)
                        viewModel.showControls()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                        viewModel.showControls()
                        true
                    }
                    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                        player.togglePlayPause()
                        viewModel.showControls()
                        true
                    }
                    KeyEvent.KEYCODE_MEDIA_PLAY -> {
                        player.play()
                        viewModel.showControls()
                        true
                    }
                    KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                        player.pause()
                        viewModel.showControls()
                        true
                    }
                    else -> false
                }
            }
    ) {
        // Fullscreen ExoPlayer Surface
        AndroidView(
            factory = { context ->
                PlayerView(context).apply {
                    this.player = player.exoPlayer
                    useController = false
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            modifier = Modifier.fillMaxSize()
        )

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
            onPlayPauseClick = { player.togglePlayPause() },
            onSeekRelative = { offset -> player.seekRelative(offset) },
            onAudioTrackSelect = { idx -> player.selectAudioTrack(idx) },
            onSubtitleTrackSelect = { idx -> player.selectSubtitleTrack(idx) },
            onBackClick = handleBack
        )
    }
}

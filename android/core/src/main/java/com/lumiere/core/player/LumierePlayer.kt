package com.lumiere.core.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient

data class TrackInfo(
    val id: String,
    val name: String,
    val language: String?,
    val isSelected: Boolean
)

@OptIn(UnstableApi::class)
class LumierePlayer(
    private val context: Context,
    okHttpClient: OkHttpClient
) {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val trackSelector = DefaultTrackSelector(context).apply {
        setParameters(
            buildUponParameters()
                .setPreferredAudioLanguage("ru")
                .setPreferredTextLanguage("ru")
                .setTunnelingEnabled(true)
        )
    }

    private val renderersFactory = DefaultRenderersFactory(context).apply {
        setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
        setEnableDecoderFallback(true)
    }

    // Strictly bounded buffer for Android TV sticks with limited RAM (1.5GB total)
    private val loadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            /* minBufferMs = */ 3000,
            /* maxBufferMs = */ 10000,
            /* bufferForPlaybackMs = */ 1500,
            /* bufferForPlaybackAfterRebufferMs = */ 3000
        )
        .setTargetBufferBytes(12 * 1024 * 1024) // 12 MB max buffer in RAM to prevent OOM reboot
        .setPrioritizeTimeOverSizeThresholds(false)
        .build()

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context, renderersFactory)
        .setLoadControl(loadControl)
        .setTrackSelector(trackSelector)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .setUsage(C.USAGE_MEDIA)
                .build(),
            /* handleAudioFocus = */ true
        )
        .build()

    private val okHttpDataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
        .setUserAgent("LumiereTV/1.0 ExoPlayer")

    private val dataSourceFactory = DefaultDataSource.Factory(context, okHttpDataSourceFactory)

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _positionMs = MutableStateFlow(0L)
    val positionMs: StateFlow<Long> = _positionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _bufferedMs = MutableStateFlow(0L)
    val bufferedMs: StateFlow<Long> = _bufferedMs.asStateFlow()

    private val _playbackState = MutableStateFlow(Player.STATE_IDLE)
    val playbackState: StateFlow<Int> = _playbackState.asStateFlow()

    private val _audioTracks = MutableStateFlow<List<TrackInfo>>(emptyList())
    val audioTracks: StateFlow<List<TrackInfo>> = _audioTracks.asStateFlow()

    private val _subtitleTracks = MutableStateFlow<List<TrackInfo>>(emptyList())
    val subtitleTracks: StateFlow<List<TrackInfo>> = _subtitleTracks.asStateFlow()

    private var progressJob: Job? = null

    init {
        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _isPlaying.value = isPlaying
            }

            override fun onPlaybackStateChanged(state: Int) {
                _playbackState.value = state
                if (state == Player.STATE_READY) {
                    _durationMs.value = exoPlayer.duration.coerceAtLeast(0L)
                    updateTracks()
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                updateTracks()
            }

            override fun onPlayerError(error: PlaybackException) {
                _playbackState.value = Player.STATE_IDLE
            }
        })

        startPositionTracker()
    }

    private fun startPositionTracker() {
        progressJob = scope.launch {
            while (isActive) {
                if (exoPlayer.playbackState == Player.STATE_READY || exoPlayer.isPlaying) {
                    _positionMs.value = exoPlayer.currentPosition.coerceAtLeast(0L)
                    _bufferedMs.value = exoPlayer.bufferedPosition.coerceAtLeast(0L)
                    _durationMs.value = exoPlayer.duration.coerceAtLeast(0L)
                }
                delay(300)
            }
        }
    }

    fun prepare(streamUrl: String, isHls: Boolean = streamUrl.contains(".m3u8"), startPositionMs: Long = 0L) {
        val uri = Uri.parse(streamUrl)
        val mediaSource = if (isHls) {
            HlsMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(uri))
        } else {
            ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(MediaItem.fromUri(uri))
        }

        exoPlayer.setMediaSource(mediaSource)
        if (startPositionMs > 0L) {
            exoPlayer.seekTo(startPositionMs)
        }
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    fun play() {
        exoPlayer.play()
    }

    fun pause() {
        exoPlayer.pause()
    }

    fun stop() {
        try {
            exoPlayer.stop()
            exoPlayer.clearMediaItems()
        } catch (_: Throwable) {}
        _isPlaying.value = false
        _playbackState.value = Player.STATE_IDLE
        _positionMs.value = 0L
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) pause() else play()
    }

    fun seekTo(positionMs: Long) {
        val dur = exoPlayer.duration
        val maxPos = if (dur > 0L) dur else Long.MAX_VALUE
        val target = positionMs.coerceIn(0L, maxPos)
        _positionMs.value = target
        exoPlayer.seekTo(target)
    }

    fun seekRelative(offsetMs: Long) {
        val current = exoPlayer.currentPosition.coerceAtLeast(0L)
        val dur = exoPlayer.duration
        val maxPos = if (dur > 0L) dur else Long.MAX_VALUE
        val target = (current + offsetMs).coerceIn(0L, maxPos)
        _positionMs.value = target
        exoPlayer.seekTo(target)
    }

    private fun updateTracks() {
        val currentTracks = exoPlayer.currentTracks
        val audios = mutableListOf<TrackInfo>()
        val subtitles = mutableListOf<TrackInfo>()

        for (group in currentTracks.groups) {
            val type = group.type
            for (i in 0 until group.length) {
                val format = group.getTrackFormat(i)
                val isSelected = group.isTrackSelected(i)
                val lang = format.language
                val label = format.label ?: lang ?: "Дорожка ${i + 1}"

                if (type == C.TRACK_TYPE_AUDIO) {
                    audios.add(
                        TrackInfo(
                            id = "$i",
                            name = label,
                            language = lang,
                            isSelected = isSelected
                        )
                    )
                } else if (type == C.TRACK_TYPE_TEXT) {
                    subtitles.add(
                        TrackInfo(
                            id = "$i",
                            name = label,
                            language = lang,
                            isSelected = isSelected
                        )
                    )
                }
            }
        }

        _audioTracks.value = audios
        _subtitleTracks.value = subtitles
    }

    fun selectAudioTrack(index: Int) {
        trackSelector.parameters = trackSelector.buildUponParameters()
            .setPreferredAudioLanguage(_audioTracks.value.getOrNull(index)?.language)
            .build()
    }

    fun selectSubtitleTrack(index: Int) {
        if (index < 0) {
            // Disable subtitles
            trackSelector.parameters = trackSelector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
        } else {
            trackSelector.parameters = trackSelector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .setPreferredTextLanguage(_subtitleTracks.value.getOrNull(index)?.language)
                .build()
        }
    }

    fun release() {
        progressJob?.cancel()
        scope.cancel()
        exoPlayer.release()
    }
}

package com.lumiere.core.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.audio.AudioCapabilities
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import android.os.Handler
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.MediaCodecAudioRenderer
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
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
private class LiveStreamLoadErrorHandlingPolicy : DefaultLoadErrorHandlingPolicy() {
    override fun getMinimumLoadableRetryCount(dataType: Int): Int {
        return if (dataType == C.DATA_TYPE_MEDIA) 1 else super.getMinimumLoadableRetryCount(dataType)
    }

    override fun getRetryDelayMsFor(loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo): Long {
        val cause = loadErrorInfo.exception
        if (cause is HttpDataSource.InvalidResponseCodeException && cause.responseCode == 404) {
            // Live chunk 404: do not delay/retry dead chunk, fail fast so listener seeks to live edge
            return C.TIME_UNSET
        }
        return super.getRetryDelayMsFor(loadErrorInfo)
    }
}

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
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        )
    }

    private val renderersFactory = object : DefaultRenderersFactory(context) {
        override fun buildAudioRenderers(
            context: Context,
            extensionRendererMode: Int,
            mediaCodecSelector: MediaCodecSelector,
            enableDecoderFallback: Boolean,
            audioSink: AudioSink,
            eventHandler: Handler,
            eventListener: AudioRendererEventListener,
            out: ArrayList<Renderer>
        ) {
            out.add(
                object : MediaCodecAudioRenderer(
                    context,
                    mediaCodecSelector,
                    enableDecoderFallback,
                    eventHandler,
                    eventListener,
                    audioSink
                ) {
                    override fun shouldUseBypass(format: Format): Boolean {
                        // Force decoding through MediaCodec (hardware/software PCM);
                        // NEVER bypass directly to raw HDMI bitstream to eliminate
                        // Amlogic audio HAL timestamp discontinuities
                        return false
                    }
                }
            )
        }

        override fun buildAudioSink(
            context: Context,
            enableFloatOutput: Boolean,
            enableAudioTrackPlaybackParams: Boolean
        ): AudioSink? {
            return DefaultAudioSink.Builder()
                .setAudioCapabilities(AudioCapabilities.DEFAULT_AUDIO_CAPABILITIES)
                .setEnableFloatOutput(enableFloatOutput)
                .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                .build()
        }
    }.apply {
        setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
        setEnableDecoderFallback(true)
        setMediaCodecSelector(MediaCodecSelector.DEFAULT)
    }

    // Clean bounded LoadControl for Android TV:
    // 3s min buffer, 15s max buffer, 32MB target cap with prioritizeTimeOverSizeThresholds
    // to ensure stream always buffers at least 3 seconds without starving,
    // and 2s back-buffer discard to prevent cumulative heap accumulation.
    private val loadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            /* minBufferMs = */ 3000,
            /* maxBufferMs = */ 15000,
            /* bufferForPlaybackMs = */ 1000,
            /* bufferForPlaybackAfterRebufferMs = */ 2000
        )
        .setTargetBufferBytes(32 * 1024 * 1024)
        .setPrioritizeTimeOverSizeThresholds(true)
        .setBackBuffer(
            /* backBufferDurationMs = */ 2000,
            /* retainBackBufferFromKeyframe = */ false
        )
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
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()

    var mediaSession: androidx.media3.session.MediaSession? = null
        private set

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
    private var pendingInitialSeekMs: Long = 0L
    private var fallbackDurationMs: Long = 0L

    fun setFallbackDuration(durationMs: Long) {
        fallbackDurationMs = durationMs
        if (_durationMs.value <= 0L && durationMs > 0L) {
            _durationMs.value = durationMs
        }
    }

    init {
        try {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val sessionActivity = if (launchIntent != null) {
                android.app.PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            } else null

            val builder = androidx.media3.session.MediaSession.Builder(context, exoPlayer)
                .setId("LumiereMediaSession_${System.currentTimeMillis()}")
            if (sessionActivity != null) {
                builder.setSessionActivity(sessionActivity)
            }
            mediaSession = builder.build()
        } catch (e: Throwable) {
            android.util.Log.w("LumierePlayer", "MediaSession creation notice: ${e.message}")
        }

        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _isPlaying.value = isPlaying
            }

            override fun onPlaybackStateChanged(state: Int) {
                _playbackState.value = state
                if (state == Player.STATE_READY) {
                    val realDur = exoPlayer.duration
                    if (realDur > 1000L) {
                        _durationMs.value = realDur
                    } else if (fallbackDurationMs > 1000L) {
                        _durationMs.value = fallbackDurationMs
                    } else {
                        _durationMs.value = realDur.coerceAtLeast(0L)
                    }
                    val pendingSeek = pendingInitialSeekMs
                    if (pendingSeek > 1000L) {
                        pendingInitialSeekMs = 0L
                        if (kotlin.math.abs(exoPlayer.currentPosition - pendingSeek) > 2000L) {
                            exoPlayer.seekTo(pendingSeek)
                        }
                    }
                    updateTracks()
                }
            }

            override fun onVideoSizeChanged(videoSize: VideoSize) {
                android.util.Log.i("LumierePlayer", "onVideoSizeChanged: ${videoSize.width}x${videoSize.height}, rotation=${videoSize.unappliedRotationDegrees}")
            }

            override fun onRenderedFirstFrame() {
                android.util.Log.i("LumierePlayer", "onRenderedFirstFrame: First video frame rendered to surface successfully!")
            }

            override fun onTracksChanged(tracks: Tracks) {
                updateTracks()
            }

            override fun onPlayerError(error: PlaybackException) {
                android.util.Log.e("LumierePlayer", "ExoPlayer onPlayerError: ${error.errorCodeName} (${error.errorCode})", error)
                val isLiveBehind = error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW
                val isHttp404 = (error.cause as? HttpDataSource.InvalidResponseCodeException)?.responseCode == 404
                if (isLiveBehind || isHttp404) {
                    android.util.Log.w("LumierePlayer", "Live stream segment 404 or behind live window, seeking to live default position...")
                    try {
                        exoPlayer.seekToDefaultPosition()
                        exoPlayer.prepare()
                        exoPlayer.play()
                        return
                    } catch (e: Exception) {
                        android.util.Log.e("LumierePlayer", "Failed to seek to live default position: ${e.message}")
                    }
                }
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
                    val realDur = exoPlayer.duration
                    if (realDur > 1000L) {
                        _durationMs.value = realDur
                    } else if (fallbackDurationMs > 1000L && _durationMs.value <= 0L) {
                        _durationMs.value = fallbackDurationMs
                    }
                }
                delay(300)
            }
        }
    }

    fun prepare(
        streamUrl: String,
        isHls: Boolean = streamUrl.contains(".m3u8"),
        startPositionMs: Long = 0L,
        isLive: Boolean = false,
        expectedDurationMs: Long = 0L
    ) {
        if (expectedDurationMs > 0L) {
            fallbackDurationMs = expectedDurationMs
            if (_durationMs.value <= 0L) {
                _durationMs.value = expectedDurationMs
            }
        }
        val uri = Uri.parse(streamUrl)
        val shouldConfigureLive = isLive
        val mediaItem = MediaItem.Builder()

            .setUri(uri)
            .apply {
                if (shouldConfigureLive) {
                    setLiveConfiguration(
                        MediaItem.LiveConfiguration.Builder()
                            .setTargetOffsetMs(3500L)
                            .setMinOffsetMs(1500L)
                            .setMaxOffsetMs(8000L)
                            .build()
                    )
                }
            }
            .build()

        val mediaSource = if (isHls) {
            val hlsFactory = HlsMediaSource.Factory(dataSourceFactory)
                .setAllowChunklessPreparation(false)
            if (shouldConfigureLive) {
                hlsFactory.setLoadErrorHandlingPolicy(LiveStreamLoadErrorHandlingPolicy())
            }
            hlsFactory.createMediaSource(mediaItem)
        } else {
            ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
        }

        pendingInitialSeekMs = if (startPositionMs > 1000L) startPositionMs else 0L
        if (startPositionMs > 0L) {
            _positionMs.value = startPositionMs
        }

        if (!subtitlesExplicitlyEnabled) {
            trackSelector.parameters = trackSelector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
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
        pendingInitialSeekMs = 0L
        fallbackDurationMs = 0L
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

    private var subtitlesExplicitlyEnabled: Boolean = false

    fun selectSubtitleTrack(index: Int) {
        if (index < 0) {
            // Disable subtitles
            subtitlesExplicitlyEnabled = false
            trackSelector.parameters = trackSelector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                .build()
        } else {
            subtitlesExplicitlyEnabled = true
            val target = _subtitleTracks.value.getOrNull(index)
            val builder = trackSelector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)

            var foundOverride = false
            for (group in exoPlayer.currentTracks.groups) {
                if (group.type == C.TRACK_TYPE_TEXT) {
                    for (i in 0 until group.length) {
                        val format = group.getTrackFormat(i)
                        val label = format.label ?: format.language ?: "Дорожка ${i + 1}"
                        if (target != null && (format.id == target.id || label == target.name)) {
                            builder.setOverrideForType(
                                androidx.media3.common.TrackSelectionOverride(group.mediaTrackGroup, i)
                            )
                            foundOverride = true
                            break
                        }
                    }
                }
                if (foundOverride) break
            }
            if (!foundOverride && target?.language != null) {
                builder.setPreferredTextLanguage(target.language)
            }
            trackSelector.parameters = builder.build()
        }
    }

    fun release() {
        progressJob?.cancel()
        scope.cancel()
        try {
            mediaSession?.release()
            mediaSession = null
        } catch (_: Throwable) {}
        exoPlayer.release()
    }
}

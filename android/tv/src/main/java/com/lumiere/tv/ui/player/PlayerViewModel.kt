package com.lumiere.tv.ui.player

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.*
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.player.LumierePlayer
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update

data class PlayerUiState(
    val isControlsVisible: Boolean = false,
    val torrServerStats: String? = null,
    val currentTitle: String = "",
    val currentSubtitle: String = "",
    val isSwitchingEpisode: Boolean = false,
    val statusMessage: String? = null,
    val isSeeking: Boolean = false,
    val seekTargetMs: Long? = null,
    val seekDeltaSec: Long = 0L
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    val player: LumierePlayer

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    private var hideControlsJob: Job? = null
    private var statsPollingJob: Job? = null

    init {
        networkClient = NetworkClient(
            baseUrlProvider = { runBlocking { preferences.serverUrl.first().orEmpty() } },
            tokenProvider = { runBlocking { preferences.accessToken.first() } },
            preferences = preferences
        )

        player = LumierePlayer(application.applicationContext, networkClient!!.okHttpClient)

        startStatsPolling()

        viewModelScope.launch {
            player.isPlaying.collect { playing ->
                if (playing) {
                    scheduleControlsHide(4000L)
                }
            }
        }

        viewModelScope.launch {
            player.positionMs.collect { posMs ->
                val sec = posMs / 1000L
                if (sec > maxPositionSec) {
                    maxPositionSec = sec
                }
            }
        }
    }

    private var seekDebounceJob: Job? = null
    private var currentSeekTargetMs: Long = 0L
    private var accumulatedSeekDeltaSec: Long = 0L
    private var lastSeekPressTime: Long = 0L

    fun onUserSeek(deltaMs: Long) {
        val now = System.currentTimeMillis()
        val dur = player.durationMs.value
        val maxPos = if (dur > 0L) dur else Long.MAX_VALUE

        val timeSinceLast = now - lastSeekPressTime
        lastSeekPressTime = now
        val effectiveDeltaMs = if (timeSinceLast in 1..300) {
            val absDelta = kotlin.math.abs(accumulatedSeekDeltaSec)
            val mult = if (absDelta >= 180) 4L
                       else if (absDelta >= 60) 2L
                       else 1L
            deltaMs * mult
        } else {
            deltaMs
        }

        if (!_uiState.value.isSeeking) {
            currentSeekTargetMs = player.positionMs.value
            accumulatedSeekDeltaSec = 0L
        }

        accumulatedSeekDeltaSec += (effectiveDeltaMs / 1000L)
        val newTarget = (currentSeekTargetMs + effectiveDeltaMs).coerceIn(0L, maxPos)
        currentSeekTargetMs = newTarget

        _uiState.update {
            it.copy(
                isSeeking = true,
                seekTargetMs = newTarget,
                seekDeltaSec = accumulatedSeekDeltaSec
            )
        }
        showControls()

        seekDebounceJob?.cancel()
        seekDebounceJob = viewModelScope.launch {
            delay(400L)
            val target = currentSeekTargetMs
            player.seekTo(target)
            delay(250L)
            _uiState.update { it.copy(isSeeking = false, seekTargetMs = null, seekDeltaSec = 0L) }
            scheduleControlsHide(4000L)
        }
    }

    private fun resolveDirectTorrServerUrl(url: String, serverUrl: String): String {
        if (!url.contains("/api/torrents/proxy")) return url
        if (url.startsWith("https://")) return url
        return try {
            val uri = android.net.Uri.parse(url)
            val host = uri.host ?: android.net.Uri.parse(serverUrl).host ?: return url
            val link = uri.getQueryParameter("link") ?: return url
            val index = uri.getQueryParameter("index") ?: "0"
            val fileName = uri.pathSegments.lastOrNull()?.takeIf { it != "proxy" } ?: "video.mkv"
            val encodedFile = java.net.URLEncoder.encode(fileName, "UTF-8")
            val encodedLink = java.net.URLEncoder.encode(link, "UTF-8")
            "http://$host:8590/stream/$encodedFile?link=$encodedLink&index=$index&play"
        } catch (_: Exception) {
            url
        }
    }

    private var maxPositionSec: Long = 0L
    private var periodicSaveJob: Job? = null
    private var heartbeatJob: Job? = null
    private var currentSessionId: String? = null
    private var activeMediaId: Long = 0L
    private var activeMediaType: String = "movie"
    private var activeTitle: String = ""
    private var activePoster: String = ""
    private var activeSeason: Int = 0
    private var activeEpisode: Int = 0

    private val deviceDisplayName: String by lazy {
        val model = android.os.Build.MODEL.orEmpty().trim()
        if (model.isNotEmpty()) "Android TV ($model)" else "Android TV Stick"
    }

    fun playStream(
        streamUrl: String,
        isHls: Boolean = streamUrl.contains(".m3u8"),
        startPositionMs: Long = 0L,
        mediaId: Long = 0L,
        mediaType: String = "movie",
        season: Int = 0,
        episode: Int = 0
    ) {
        viewModelScope.launch {
            var initialSeek = startPositionMs
            if (initialSeek <= 0L && mediaId > 0L) {
                val savedSec = if (mediaType == "tv" && episode > 0) {
                    preferences.getEpisodePlaybackPosition(mediaId, season, episode) ?: 0L
                } else if (mediaType != "tv") {
                    preferences.getPlaybackPosition(mediaId, mediaType) ?: 0L
                } else {
                    0L
                }
                if (savedSec > 5L) {
                    initialSeek = savedSec * 1000L
                }
            }
            if (initialSeek > 0L) {
                maxPositionSec = initialSeek / 1000L
            }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val effectiveUrl = resolveDirectTorrServerUrl(streamUrl, serverUrl)
            android.util.Log.i("PlayerViewModel", "Resolved playback stream URL: $effectiveUrl")
            player.prepare(
                streamUrl = effectiveUrl,
                isHls = isHls,
                startPositionMs = initialSeek,
                isLive = (mediaType == "iptv")
            )

            // Auto-fetch runtime metadata for fallback duration if mediaId is available
            if (mediaId > 0L) {
                launch(Dispatchers.IO) {
                    try {
                        val serverUrl = preferences.serverUrl.first().orEmpty()
                        val api = networkClient?.createApiService(serverUrl)
                        if (api != null) {
                            val details = if (mediaType == "tv") api.getTvDetails(mediaId) else api.getMovieDetails(mediaId)
                            val runtimeStr = details.runtime
                            val minutes = runtimeStr?.filter { it.isDigit() }?.toLongOrNull() ?: if (mediaType == "tv") 48L else 105L
                            if (minutes in 5..360) {
                                player.setFallbackDuration(minutes * 60 * 1000L)
                            }
                        }
                    } catch (_: Exception) {}
                }
            }
        }
    }

    fun startPeriodicProgressSaving(
        mediaId: Long,
        mediaType: String,
        title: String,
        poster: String,
        season: Int = 0,
        episode: Int = 0
    ) {
        activeMediaId = mediaId
        activeMediaType = mediaType
        activeTitle = title
        activePoster = poster
        activeSeason = season
        activeEpisode = episode

        // Stop prior session if any
        val oldSessionId = currentSessionId
        if (!oldSessionId.isNullOrBlank()) {
            GlobalScope.launch(Dispatchers.IO + NonCancellable) {
                try {
                    val serverUrl = preferences.serverUrl.first().orEmpty()
                    if (serverUrl.isNotBlank()) {
                        networkClient?.createApiService(serverUrl)?.stopSession(
                            com.lumiere.core.model.SessionStopRequest(oldSessionId)
                        )
                    }
                } catch (_: Exception) {}
            }
        }

        val newSessionId = "android-tv-${System.currentTimeMillis()}-${(1000..9999).random()}"
        currentSessionId = newSessionId

        periodicSaveJob?.cancel()
        heartbeatJob?.cancel()

        if (mediaId <= 0L) return

        periodicSaveJob = viewModelScope.launch {
            while (isActive) {
                delay(5000L)
                if (player.isPlaying.value) {
                    saveWatchProgress(mediaId, mediaType, title, poster)
                }
            }
        }

        // Real-time session heartbeat loop (every 4s)
        heartbeatJob = viewModelScope.launch {
            while (isActive) {
                try {
                    val serverUrl = preferences.serverUrl.first().orEmpty()
                    if (serverUrl.isNotBlank()) {
                        val currentSec = player.positionMs.value / 1000L
                        val durSec = player.durationMs.value / 1000L
                        val isPaused = !player.isPlaying.value

                        val api = networkClient?.createApiService(serverUrl)
                        val resp = api?.sendSessionHeartbeat(
                            com.lumiere.core.model.SessionHeartbeatRequest(
                                sessionId = newSessionId,
                                deviceType = "tv",
                                deviceName = deviceDisplayName,
                                mediaType = mediaType,
                                mediaId = mediaId.toString(),
                                mediaTitle = title,
                                mediaPoster = poster,
                                season = season,
                                episode = episode,
                                currentTime = currentSec,
                                duration = durSec,
                                isPaused = isPaused
                            )
                        )

                        if (resp?.terminate == true) {
                            player.pause()
                        }
                    }
                } catch (_: Exception) {}
                delay(4000L)
            }
        }
    }

    fun showControls() {
        _uiState.update { it.copy(isControlsVisible = true) }
        scheduleControlsHide(4000L)
    }

    fun hideControls() {
        hideControlsJob?.cancel()
        _uiState.update { it.copy(isControlsVisible = false) }
    }

    fun toggleControls() {
        val willBeVisible = !_uiState.value.isControlsVisible
        _uiState.update { it.copy(isControlsVisible = willBeVisible) }
        if (willBeVisible) {
            scheduleControlsHide(4000L)
        } else {
            hideControlsJob?.cancel()
        }
    }

    fun scheduleControlsHide(delayMs: Long = 4000L) {
        hideControlsJob?.cancel()
        hideControlsJob = viewModelScope.launch {
            delay(delayMs)
            if (player.isPlaying.value) {
                _uiState.update { it.copy(isControlsVisible = false) }
            }
        }
    }

    private fun startStatsPolling() {
        statsPollingJob = viewModelScope.launch {
            while (isActive) {
                try {
                    val serverUrl = preferences.serverUrl.first().orEmpty()
                    if (serverUrl.isNotBlank()) {
                        val api = networkClient?.createApiService(serverUrl)
                        val stats = api?.getTorrServerStats().orEmpty()
                        val active = stats.firstOrNull { (it.activePeers ?: 0) > 0 || (it.downloadSpeed ?: 0.0) > 0.0 }
                            ?: stats.firstOrNull()

                        if (active != null) {
                            val speedMb = (active.downloadSpeed ?: 0.0) / (1024.0 * 1024.0)
                            val peers = active.activePeers ?: 0
                            val totalPeers = active.totalPeers ?: 0
                            val banner = String.format("🌱 Пиры: %d/%d  ⚡ %.1f MB/s", peers, totalPeers, speedMb)
                            _uiState.update { it.copy(torrServerStats = banner) }
                        } else {
                            _uiState.update { it.copy(torrServerStats = null) }
                        }
                    }
                } catch (_: Exception) {
                    _uiState.update { it.copy(torrServerStats = null) }
                }
                delay(2000)
            }
        }
    }

    @OptIn(DelicateCoroutinesApi::class)
    fun saveWatchProgress(
        mediaId: Long,
        mediaType: String,
        title: String = "",
        poster: String = "",
        season: Int = activeSeason,
        episode: Int = activeEpisode
    ) {
        if (mediaId <= 0L) return
        val rawSec = player.positionMs.value / 1000L
        val currentSec = if (rawSec > 0L) rawSec else maxPositionSec
        val durSec = player.durationMs.value / 1000L

        // Episode/film completed if within 60s of end OR >= 90% watched (credits roll!)
        val isCompleted = durSec > 60L && (
            (durSec - currentSec <= 60L) || (currentSec.toDouble() / durSec.toDouble() >= 0.90)
        )
        val effectiveSec = if (isCompleted) 0L else currentSec

        // Guard: Do not overwrite progress with 0 or < 5s if user hasn't finished the film
        if (effectiveSec < 5L && !isCompleted) return

        // Launch in GlobalScope with NonCancellable to ensure persistence completes even if ViewModel is cleared
        GlobalScope.launch(Dispatchers.IO + NonCancellable) {
            try {
                if (mediaType == "tv" && episode > 0) {
                    preferences.setEpisodePlaybackPosition(mediaId, season, episode, effectiveSec)
                    if (isCompleted) {
                        preferences.setLastWatchedSeries(mediaId, season, episode + 1)
                        preferences.setPlaybackPosition(mediaId, mediaType, 0L)
                    } else {
                        preferences.setLastWatchedSeries(mediaId, season, episode)
                        preferences.setPlaybackPosition(mediaId, mediaType, effectiveSec)
                    }
                } else {
                    preferences.setPlaybackPosition(mediaId, mediaType, effectiveSec)
                }

                val serverUrl = preferences.serverUrl.first().orEmpty()
                if (serverUrl.isNotBlank()) {
                    val api = networkClient?.createApiService(serverUrl)
                    api?.saveWatchProgress(
                        com.lumiere.core.model.WatchProgressRequest(
                            tmdbId = mediaId,
                            mediaType = mediaType,
                            titleName = title,
                            poster = poster,
                            progress = effectiveSec,
                            timestamp = System.currentTimeMillis()
                        )
                    )
                }
            } catch (_: Exception) {}
        }
    }

    fun setInitialMetadata(title: String, subtitle: String) {
        _uiState.update {
            it.copy(
                currentTitle = if (it.currentTitle.isNotBlank()) it.currentTitle else title,
                currentSubtitle = if (it.currentSubtitle.isNotBlank()) it.currentSubtitle else subtitle
            )
        }
    }

    private var switchEpisodeJob: Job? = null

    fun previousEpisodeOrStart() {
        val currentSec = player.positionMs.value / 1000L
        if (activeMediaType != "tv") {
            player.seekTo(0L)
            return
        }

        // If played more than 10 seconds: standard behavior rewinds to beginning of current episode (0:00)
        if (currentSec > 10L) {
            player.seekTo(0L)
            return
        }

        // In first 10 seconds: switch to previous episode if available
        if (activeEpisode > 1) {
            val prevEp = activeEpisode - 1
            switchEpisode(activeSeason, prevEp)
        } else {
            player.seekTo(0L)
        }
    }

    fun nextEpisodeOrEnd() {
        if (activeMediaType != "tv") {
            val durMs = player.durationMs.value
            if (durMs > 5000L) {
                player.seekTo(durMs - 3000L)
            }
            return
        }

        // For TV series: save watch progress and advance to next episode
        saveWatchProgress(activeMediaId, activeMediaType, activeTitle, activePoster, activeSeason, activeEpisode)
        val nextEp = activeEpisode + 1
        switchEpisode(activeSeason, nextEp)
    }

    fun switchEpisode(season: Int, episode: Int) {
        if (activeMediaId <= 0L) return
        switchEpisodeJob?.cancel()
        switchEpisodeJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isSwitchingEpisode = true,
                    statusMessage = "Загрузка серии $episode..."
                )
            }
            try {
                val serverUrl = preferences.serverUrl.first().orEmpty()
                val api = networkClient?.createApiService(serverUrl) ?: return@launch

                val videoExtensions = listOf(".mkv", ".mp4", ".avi", ".ts", ".m4v", ".webm", ".mov")

                // 1. Check last played torrent for this season
                val lastTorrentPair = preferences.getLastPlayedTorrent(activeMediaId, season)
                    ?: preferences.getLastPlayedTorrent(activeMediaId, 0)

                var matchedUrl: String? = null
                var isHls = false

                if (lastTorrentPair != null) {
                    val (magnet, torrentTitle) = lastTorrentPair
                    try {
                        var streamInfo = api.getTorrentStreamInfo(
                            TorrentStreamRequest(magnet = magnet, title = torrentTitle)
                        )
                        var attempts = 0
                        while (streamInfo.files.isEmpty() && attempts < 5) {
                            delay(800)
                            attempts++
                            streamInfo = api.getTorrentStreamInfo(
                                TorrentStreamRequest(magnet = magnet, title = torrentTitle)
                            )
                        }

                        if (streamInfo.files.isNotEmpty()) {
                            val videoFiles = streamInfo.files.filter { f ->
                                val l = f.name.lowercase()
                                videoExtensions.any { l.endsWith(it) } && !l.contains("sample")
                            }.ifEmpty { streamInfo.files }

                            val file = com.lumiere.tv.ui.components.TorrentMetaParser.findMatchingFile(
                                files = videoFiles,
                                season = season,
                                episode = episode
                            )
                            if (file != null) {
                                val rel = file.streamUrl ?: file.directUrl ?: file.hlsUrl
                                if (!rel.isNullOrBlank()) {
                                    matchedUrl = if (rel.startsWith("http")) rel else "$serverUrl$rel"
                                    isHls = rel.contains(".m3u8")
                                    preferences.setLastPlayedTorrent(activeMediaId, season, magnet, torrentTitle)
                                }
                            }
                        }
                    } catch (_: Exception) {}
                }

                // 2. If not found in current torrent, search torrents matching season & episode, preserving voiceover
                if (matchedUrl == null) {
                    val searchRes = api.searchTorrents(
                        query = activeTitle,
                        tmdbId = activeMediaId,
                        type = "tv",
                        year = null
                    )
                    val torrents = searchRes.torrents.ifEmpty { searchRes.results }

                    val preferredMeta = lastTorrentPair?.second?.let {
                        com.lumiere.tv.ui.components.TorrentMetaParser.parse(it)
                    }
                    val preferredVoices = preferredMeta?.voices.orEmpty()
                    val preferredRes = preferredMeta?.resolution

                    val candidates = torrents.filter {
                        com.lumiere.tv.ui.components.TorrentMetaParser.matchesTorrentSeason(it.title, season)
                    }.sortedWith(
                        compareByDescending<TorrentItem> { cand ->
                            var score = 0
                            if (com.lumiere.tv.ui.components.TorrentMetaParser.checkTorrentEpisode(cand.title, season, episode)) {
                                score += 1000
                            }
                            val candMeta = com.lumiere.tv.ui.components.TorrentMetaParser.parse(cand.title)
                            if (preferredVoices.isNotEmpty() && candMeta.voices.any { v -> preferredVoices.any { pv -> pv.equals(v, ignoreCase = true) } }) {
                                score += 500
                            }
                            if (!preferredRes.isNullOrBlank() && candMeta.resolution.equals(preferredRes, ignoreCase = true)) {
                                score += 100
                            }
                            val tLower = cand.title.lowercase()
                            val isLegacyAvi = tLower.contains("xvid") || tLower.contains(".avi") || tLower.contains("dlrip") ||
                                              tLower.contains("web-dlrip") || tLower.contains("dvdrip") || tLower.contains("satrip") ||
                                              tLower.contains("bdrip") || (tLower.contains("avi") && !tLower.contains("davinci"))
                            if (isLegacyAvi) score -= 300
                            score
                        }.thenByDescending { it.seeders ?: 0 }
                    )

                    for (cand in candidates.take(5)) {
                        try {
                            var streamInfo = api.getTorrentStreamInfo(
                                TorrentStreamRequest(magnet = cand.magnet, title = cand.title)
                            )
                            var attempts = 0
                            while (streamInfo.files.isEmpty() && attempts < 5) {
                                delay(800)
                                attempts++
                                streamInfo = api.getTorrentStreamInfo(
                                    TorrentStreamRequest(magnet = cand.magnet, title = cand.title)
                                )
                            }

                            val videoFiles = streamInfo.files.filter { f ->
                                val l = f.name.lowercase()
                                videoExtensions.any { l.endsWith(it) } && !l.contains("sample")
                            }.ifEmpty { streamInfo.files }

                            val file = com.lumiere.tv.ui.components.TorrentMetaParser.findMatchingFile(
                                files = videoFiles,
                                season = season,
                                episode = episode
                            )
                            if (file != null) {
                                val rel = file.streamUrl ?: file.directUrl ?: file.hlsUrl
                                if (!rel.isNullOrBlank()) {
                                    matchedUrl = if (rel.startsWith("http")) rel else "$serverUrl$rel"
                                    isHls = rel.contains(".m3u8")
                                    preferences.setLastPlayedTorrent(activeMediaId, season, cand.magnet, cand.title)
                                    break
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }

                if (matchedUrl != null) {
                    activeSeason = season
                    activeEpisode = episode
                    maxPositionSec = 0L

                    val epSubtitle = "Сезон $season, Серия $episode"
                    _uiState.update {
                        it.copy(
                            currentSubtitle = epSubtitle,
                            isSwitchingEpisode = false,
                            statusMessage = null
                        )
                    }

                    // Check if target episode has saved progress
                    val savedPos = preferences.getEpisodePlaybackPosition(activeMediaId, season, episode) ?: 0L
                    val startPosMs = if (savedPos > 5L) savedPos * 1000L else 0L

                    playStream(
                        streamUrl = matchedUrl,
                        isHls = isHls,
                        startPositionMs = startPosMs,
                        mediaId = activeMediaId,
                        mediaType = activeMediaType,
                        season = season,
                        episode = episode
                    )
                    startPeriodicProgressSaving(
                        mediaId = activeMediaId,
                        mediaType = activeMediaType,
                        title = activeTitle,
                        poster = activePoster,
                        season = season,
                        episode = episode
                    )
                    preferences.setLastWatchedSeries(activeMediaId, season, episode)
                } else {
                    _uiState.update {
                        it.copy(
                            isSwitchingEpisode = false,
                            statusMessage = "Серия $episode не найдена в источниках"
                        )
                    }
                    delay(3000)
                    _uiState.update { it.copy(statusMessage = null) }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSwitchingEpisode = false,
                        statusMessage = "Ошибка загрузки: ${e.message}"
                    )
                }
                delay(3000)
                _uiState.update { it.copy(statusMessage = null) }
            }
        }
    }

    @OptIn(DelicateCoroutinesApi::class)
    override fun onCleared() {
        super.onCleared()
        if (activeMediaId > 0L) {
            saveWatchProgress(activeMediaId, activeMediaType, activeTitle, activePoster)
        }
        val closingSessionId = currentSessionId
        if (!closingSessionId.isNullOrBlank()) {
            GlobalScope.launch(Dispatchers.IO + NonCancellable) {
                try {
                    val serverUrl = preferences.serverUrl.first().orEmpty()
                    if (serverUrl.isNotBlank()) {
                        networkClient?.createApiService(serverUrl)?.stopSession(
                            com.lumiere.core.model.SessionStopRequest(closingSessionId)
                        )
                    }
                } catch (_: Exception) {}
            }
        }
        heartbeatJob?.cancel()
        periodicSaveJob?.cancel()
        hideControlsJob?.cancel()
        statsPollingJob?.cancel()
        player.release()
    }
}

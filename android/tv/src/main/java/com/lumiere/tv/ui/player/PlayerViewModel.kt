package com.lumiere.tv.ui.player

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
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
    val torrServerStats: String? = null
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
    }

    private var periodicSaveJob: Job? = null
    private var activeMediaId: Long = 0L
    private var activeMediaType: String = "movie"
    private var activeTitle: String = ""
    private var activePoster: String = ""

    fun playStream(streamUrl: String, isHls: Boolean = streamUrl.contains(".m3u8"), startPositionMs: Long = 0L) {
        player.prepare(streamUrl, isHls, startPositionMs)
    }

    fun startPeriodicProgressSaving(mediaId: Long, mediaType: String, title: String, poster: String) {
        activeMediaId = mediaId
        activeMediaType = mediaType
        activeTitle = title
        activePoster = poster
        periodicSaveJob?.cancel()
        if (mediaId <= 0L) return
        periodicSaveJob = viewModelScope.launch {
            while (isActive) {
                delay(10000L)
                if (player.isPlaying.value) {
                    saveWatchProgress(mediaId, mediaType, title, poster)
                }
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
    fun saveWatchProgress(mediaId: Long, mediaType: String, title: String = "", poster: String = "") {
        if (mediaId <= 0L) return
        val currentSec = player.positionMs.value / 1000
        val durSec = player.durationMs.value / 1000
        val effectiveSec = if (durSec > 60 && currentSec >= durSec - 15) 0L else currentSec

        // Launch in GlobalScope with NonCancellable to ensure persistence completes even if ViewModel is cleared
        GlobalScope.launch(Dispatchers.IO + NonCancellable) {
            try {
                preferences.setPlaybackPosition(mediaId, mediaType, effectiveSec)
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

    override fun onCleared() {
        super.onCleared()
        if (activeMediaId > 0L) {
            saveWatchProgress(activeMediaId, activeMediaType, activeTitle, activePoster)
        }
        periodicSaveJob?.cancel()
        hideControlsJob?.cancel()
        statsPollingJob?.cancel()
        player.release()
    }
}

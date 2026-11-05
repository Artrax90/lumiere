package com.lumiere.tv.ui.iptv

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.EpgProgram
import com.lumiere.core.model.IptvChannel
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.player.LumierePlayer
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class IptvUiState(
    val isLoading: Boolean = false,
    val allChannels: List<IptvChannel> = emptyList(),
    val displayedChannels: List<IptvChannel> = emptyList(),
    val groups: List<String> = emptyList(),
    val selectedGroup: String = "Все",
    val focusedChannel: IptvChannel? = null,
    val activeChannel: IptvChannel? = null,
    val favoriteIds: Set<String> = emptySet(),
    val isPlayerMode: Boolean = false,
    val isMultiViewMode: Boolean = false,
    val multiViewSecondaryChannel: IptvChannel? = null,
    val multiViewAudioOnPrimary: Boolean = true,
    val isSidebarVisible: Boolean = false,
    val showChannelBanner: Boolean = false,
    val currentProgramDetail: EpgProgram? = null,
    val upcomingSchedule: List<EpgProgram> = emptyList(),
    val currentProgramProgress: Float = 0f,
    val currentProgramTimeText: String = "",
    val searchQuery: String = "",
    val errorMessage: String? = null
)

class IptvViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private val favPrefs = application.getSharedPreferences("lumiere_tv2_iptv_favs", Context.MODE_PRIVATE)
    private var networkClient: NetworkClient? = null

    val player: LumierePlayer
    var secondaryPlayer: LumierePlayer? = null
        private set

    private val _uiState = MutableStateFlow(IptvUiState())
    val uiState: StateFlow<IptvUiState> = _uiState.asStateFlow()

    private var bannerJob: Job? = null
    private var focusDebounceJob: Job? = null
    private var previewJob: Job? = null
    private var iptvHeartbeatJob: Job? = null
    private var iptvSessionId: String? = null

    private var rawEpgData: Map<String, List<EpgProgram>> = emptyMap()
    private val channelIdToEpgIdMap = HashMap<String, String>()

    private val deviceDisplayName: String by lazy {
        val model = android.os.Build.MODEL.orEmpty().trim()
        if (model.isNotEmpty()) "Android TV ($model)" else "Android TV Stick"
    }

    init {
        networkClient = NetworkClient(
            baseUrlProvider = { runBlocking { preferences.serverUrl.first().orEmpty() } },
            tokenProvider = { runBlocking { preferences.accessToken.first() } }
        )

        player = LumierePlayer(application.applicationContext, networkClient!!.okHttpClient)
        player.exoPlayer.volume = 0f // Start muted for preview

        val savedFavs = favPrefs.getStringSet("fav_ids", emptySet()) ?: emptySet()
        _uiState.update { it.copy(favoriteIds = savedFavs) }

        loadChannels()
    }

    fun loadChannels() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank()) {
                _uiState.update { it.copy(isLoading = false, errorMessage = "Сервер не настроен") }
                return@launch
            }

            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val res = try {
                    val defaultRes = api.getDefaultIptvPlaylist()
                    if (defaultRes.channels.isNotEmpty()) defaultRes else api.parseIptvPlaylist()
                } catch (_: Exception) {
                    api.parseIptvPlaylist()
                }
                val channels = res.channels
                val baseGroups = if (res.groups.isNotEmpty()) res.groups else listOf("Все")
                val groupsWithFavs = buildGroupList(baseGroups, _uiState.value.favoriteIds)

                val initialActive = channels.firstOrNull()

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        allChannels = channels,
                        displayedChannels = channels,
                        groups = groupsWithFavs,
                        activeChannel = initialActive,
                        focusedChannel = initialActive
                    )
                }

                if (initialActive != null) {
                    onChannelFocused(initialActive)
                }

                // Trigger EPG loading with fallback to iptvx.one XMLTV
                val targetEpg = res.epgUrl?.takeIf { it.isNotBlank() } ?: "https://iptvx.one/epg/epg_lite.xml.gz"
                loadEpg(targetEpg, channels, api)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Ошибка загрузки каналов: ${e.message}"
                    )
                }
            }
        }
    }

    private fun buildGroupList(baseGroups: List<String>, favs: Set<String>): List<String> {
        val list = mutableListOf<String>()
        if (favs.isNotEmpty()) {
            list.add("★ Избранное")
        }
        list.add("Все")
        baseGroups.filter { it != "Все" && it != "★ Избранное" }.forEach { list.add(it) }
        return list
    }

    private fun loadEpg(epgUrl: String, baseChannels: List<IptvChannel>, api: com.lumiere.core.network.LumiereApiService) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val epgRes = api.getEpg(mapOf("url" to epgUrl))
                val now = System.currentTimeMillis()

                rawEpgData = epgRes.epg
                val rawChannelMap = epgRes.channelMap
                val iconMap = epgRes.iconMap

                // Precompute O(1) channel ID -> EPG ID mapping once in background
                val precomputedMap = HashMap<String, String>()
                for (channel in baseChannels) {
                    var epgId: String? = null
                    if (!channel.tvgId.isNullOrBlank() && rawEpgData.containsKey(channel.tvgId)) {
                        epgId = channel.tvgId
                    } else {
                        val clean = normalizeChannelName(channel.name)
                        epgId = rawChannelMap[clean]
                        if (epgId == null || !rawEpgData.containsKey(epgId)) {
                            epgId = rawChannelMap.entries.firstOrNull { (k, id) ->
                                (clean.contains(k) || k.contains(clean)) && rawEpgData.containsKey(id)
                            }?.value
                        }
                    }
                    if (epgId != null) {
                        precomputedMap[channel.id] = epgId
                    }
                }

                channelIdToEpgIdMap.clear()
                channelIdToEpgIdMap.putAll(precomputedMap)

                val enrichedChannels = baseChannels.map { channel ->
                    val epgList = getEpgForChannel(channel)
                    if (epgList.isNotEmpty()) {
                        var curProg = epgList.firstOrNull { prog ->
                            val s = parseEpgTime(prog.start)
                            val e = parseEpgTime(prog.stop)
                            s > 0 && e > 0 && now in s until e
                        }
                        if (curProg == null) {
                            curProg = epgList.firstOrNull { prog ->
                                val s = parseEpgTime(prog.start)
                                s >= now
                            }
                        }

                        val curTitle = curProg?.let {
                            if (!it.startTime.isNullOrBlank()) "${it.startTime} ${it.title}" else it.title
                        }

                        val curStart = curProg?.let { parseEpgTime(it.start) } ?: now
                        val nextProg = epgList.firstOrNull { parseEpgTime(it.start) > curStart }
                        val nextTitle = nextProg?.let {
                            if (!it.startTime.isNullOrBlank()) "${it.startTime} ${it.title}" else it.title
                        }

                        val logo = if (channel.logo.isNullOrBlank()) {
                            val epgId = precomputedMap[channel.id] ?: channel.tvgId
                            if (epgId != null) iconMap[epgId] ?: "https://iptvx.one/picons/$epgId.png" else channel.logo
                        } else channel.logo

                        channel.copy(
                            currentProgram = curTitle ?: channel.currentProgram,
                            nextProgram = nextTitle ?: channel.nextProgram,
                            logo = logo
                        )
                    } else {
                        channel
                    }
                }

                withContext(Dispatchers.Main) {
                    _uiState.update { current ->
                        val group = current.selectedGroup
                        val filtered = filterChannels(enrichedChannels, group, current.favoriteIds, query = current.searchQuery)
                        val updatedActive = current.activeChannel?.let { act ->
                            enrichedChannels.find { it.id == act.id } ?: act
                        } ?: enrichedChannels.firstOrNull()

                        val updatedFocused = current.focusedChannel?.let { foc ->
                            enrichedChannels.find { it.id == foc.id } ?: foc
                        } ?: updatedActive

                        current.copy(
                            allChannels = enrichedChannels,
                            displayedChannels = filtered,
                            activeChannel = updatedActive,
                            focusedChannel = updatedFocused
                        )
                    }

                    _uiState.value.focusedChannel?.let { onChannelFocused(it) }
                }
            } catch (e: Exception) {
                android.util.Log.w("LumiereTV", "EPG load failed: ${e.message}")
            }
        }
    }

    private fun getEpgForChannel(channel: IptvChannel): List<EpgProgram> {
        val epgId = channelIdToEpgIdMap[channel.id] ?: channel.tvgId
        return epgId?.let { rawEpgData[it] }.orEmpty()
    }

    private fun normalizeChannelName(raw: String): String {
        return raw.lowercase(java.util.Locale.ROOT)
            .replace(Regex("\\b(hd|sd|uhd|4k|fhd|50fps|original|orig)\\b", RegexOption.IGNORE_CASE), "")
            .replace(Regex("[^a-zA-Zа-яА-Я0-9]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun parseEpgTime(ts: String?): Long {
        if (ts.isNullOrBlank()) return 0L
        return try {
            val sdf = java.text.SimpleDateFormat("yyyyMMddHHmmss Z", java.util.Locale.US)
            sdf.parse(ts.trim())?.time ?: 0L
        } catch (_: Exception) {
            try {
                val clean = ts.take(14)
                val sdf = java.text.SimpleDateFormat("yyyyMMddHHmmss", java.util.Locale.US)
                sdf.parse(clean)?.time ?: 0L
            } catch (_: Exception) { 0L }
        }
    }

    private fun filterChannels(
        all: List<IptvChannel>,
        group: String,
        favs: Set<String>,
        query: String = ""
    ): List<IptvChannel> {
        val byGroup = when (group) {
            "★ Избранное" -> all.filter { favs.contains(it.id) || favs.contains(it.name) }
            "Все", "" -> all
            else -> all.filter { it.group == group }
        }
        val q = query.trim().lowercase()
        if (q.isBlank()) return byGroup

        val filtered = byGroup.filter {
            it.name.contains(q, ignoreCase = true) ||
            (it.currentProgram?.contains(q, ignoreCase = true) == true)
        }
        // Fallback: If searching within a specific category yields 0 results, search across all channels
        if (filtered.isEmpty() && group != "Все") {
            return all.filter {
                it.name.contains(q, ignoreCase = true) ||
                (it.currentProgram?.contains(q, ignoreCase = true) == true)
            }
        }
        return filtered
    }

    fun selectGroup(group: String) {
        val filtered = filterChannels(
            all = _uiState.value.allChannels,
            group = group,
            favs = _uiState.value.favoriteIds,
            query = _uiState.value.searchQuery
        )
        val newFocused = filtered.firstOrNull()

        _uiState.update {
            it.copy(
                selectedGroup = group,
                displayedChannels = filtered,
                focusedChannel = newFocused
            )
        }

        if (newFocused != null) {
            onChannelFocused(newFocused)
        }
    }

    fun setSearchQuery(query: String) {
        val filtered = filterChannels(
            all = _uiState.value.allChannels,
            group = _uiState.value.selectedGroup,
            favs = _uiState.value.favoriteIds,
            query = query
        )
        val newFocused = filtered.firstOrNull()

        _uiState.update {
            it.copy(
                searchQuery = query,
                displayedChannels = filtered,
                focusedChannel = newFocused
            )
        }

        if (newFocused != null) {
            onChannelFocused(newFocused)
        }
    }

    fun onChannelFocused(channel: IptvChannel) {
        if (_uiState.value.focusedChannel?.id == channel.id && _uiState.value.currentProgramDetail != null) return

        focusDebounceJob?.cancel()
        previewJob?.cancel()

        // Debounce calculation so fast D-pad scrolling skips intermediate processing
        focusDebounceJob = viewModelScope.launch(Dispatchers.Default) {
            delay(100)
            val epgList = getEpgForChannel(channel)
            val now = System.currentTimeMillis()

            var curProg = epgList.firstOrNull { prog ->
                val s = parseEpgTime(prog.start)
                val e = parseEpgTime(prog.stop)
                s > 0 && e > 0 && now in s until e
            }
            if (curProg == null) {
                curProg = epgList.firstOrNull { prog ->
                    val s = parseEpgTime(prog.start)
                    s >= now
                }
            }

            val s = curProg?.let { parseEpgTime(it.start) } ?: 0L
            val e = curProg?.let { parseEpgTime(it.stop) } ?: 0L
            val progress = if (s > 0 && e > s) {
                ((now - s).toFloat() / (e - s).toFloat()).coerceIn(0f, 1f)
            } else 0f

            val remainingMin = if (e > now) ((e - now) / 60_000L).toInt().coerceAtLeast(1) else 0
            val timeText = if (curProg != null && !curProg.startTime.isNullOrBlank()) {
                val endStr = curProg.stopTime?.let { " — $it" } ?: ""
                "${curProg.startTime}$endStr" + (if (remainingMin > 0) " (осталось $remainingMin мин)" else "")
            } else ""

            val curStartTime = curProg?.let { parseEpgTime(it.start) } ?: now
            val upcoming = epgList.filter { parseEpgTime(it.start) > curStartTime }.take(60)

            withContext(Dispatchers.Main) {
                _uiState.update {
                    it.copy(
                        focusedChannel = channel,
                        currentProgramDetail = curProg,
                        upcomingSchedule = upcoming,
                        currentProgramProgress = progress,
                        currentProgramTimeText = timeText
                    )
                }
            }

            // Preview stream debounce (400ms)
            if (!_uiState.value.isPlayerMode && !_uiState.value.isMultiViewMode) {
                delay(300)
                val serverUrl = preferences.serverUrl.first().orEmpty()
                val encoded = URLEncoder.encode(channel.url, StandardCharsets.UTF_8.toString())
                val streamUrl = if (serverUrl.isNotBlank()) "$serverUrl/api/iptv/stream?url=$encoded" else channel.url
                val isHls = channel.url.contains(".m3u", ignoreCase = true) || !channel.url.endsWith(".ts", ignoreCase = true)
                withContext(Dispatchers.Main) {
                    if (_uiState.value.focusedChannel?.id == channel.id && !_uiState.value.isPlayerMode) {
                        player.exoPlayer.volume = 0f
                        player.prepare(streamUrl, isHls = isHls, startPositionMs = 0L, isLive = true)
                    }
                }
            }
        }
    }

    fun toggleFavorite(channel: IptvChannel) {
        val currentFavs = _uiState.value.favoriteIds.toMutableSet()
        val key = channel.id
        val wasInFavs = currentFavs.contains(key) || currentFavs.contains(channel.name)
        if (wasInFavs) {
            currentFavs.remove(key)
            currentFavs.remove(channel.name)
        } else {
            currentFavs.add(key)
        }

        favPrefs.edit().putStringSet("fav_ids", currentFavs).apply()

        val nextGroup = if (currentFavs.isEmpty() && _uiState.value.selectedGroup == "★ Избранное") {
            "Все"
        } else {
            _uiState.value.selectedGroup
        }

        val updatedGroups = buildGroupList(_uiState.value.groups, currentFavs)
        val filtered = filterChannels(
            all = _uiState.value.allChannels,
            group = nextGroup,
            favs = currentFavs,
            query = _uiState.value.searchQuery
        )

        val oldIdx = _uiState.value.displayedChannels.indexOfFirst { it.id == channel.id }
        val newFocused = if (filtered.isEmpty()) {
            null
        } else {
            val nextIdx = if (nextGroup == "★ Избранное" && oldIdx >= 0) {
                oldIdx.coerceAtMost(filtered.size - 1)
            } else if (nextGroup == "Все" && _uiState.value.selectedGroup == "★ Избранное") {
                val chIdx = filtered.indexOfFirst { it.id == channel.id }
                if (chIdx >= 0) chIdx else 0
            } else if (oldIdx >= 0) {
                oldIdx.coerceAtMost(filtered.size - 1)
            } else {
                0
            }
            filtered[nextIdx]
        }

        _uiState.update {
            it.copy(
                favoriteIds = currentFavs,
                groups = updatedGroups,
                selectedGroup = nextGroup,
                displayedChannels = filtered,
                focusedChannel = newFocused
            )
        }

        if (newFocused != null) {
            onChannelFocused(newFocused)
        }
    }

    fun playChannel(channel: IptvChannel) {
        focusDebounceJob?.cancel()
        previewJob?.cancel()
        _uiState.update {
            it.copy(
                activeChannel = channel,
                focusedChannel = channel,
                isPlayerMode = true,
                isMultiViewMode = false,
                isSidebarVisible = false
            )
        }

        // Unmute player for fullscreen mode
        player.exoPlayer.volume = 1f

        // Stop prior IPTV session if any
        val oldSessionId = iptvSessionId
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

        val newSessionId = "android-tv2-iptv-${System.currentTimeMillis()}-${(1000..9999).random()}"
        iptvSessionId = newSessionId

        iptvHeartbeatJob?.cancel()

        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val encoded = URLEncoder.encode(channel.url, StandardCharsets.UTF_8.toString())
            val streamUrl = if (serverUrl.isNotBlank()) "$serverUrl/api/iptv/stream?url=$encoded" else channel.url
            val isHls = channel.url.contains(".m3u", ignoreCase = true) || !channel.url.endsWith(".ts", ignoreCase = true)
            player.prepare(streamUrl, isHls = isHls, startPositionMs = 0L, isLive = true)
            showBanner()
        }

        // Periodic IPTV session heartbeat loop (every 4s)
        iptvHeartbeatJob = viewModelScope.launch {
            while (isActive) {
                try {
                    val serverUrl = preferences.serverUrl.first().orEmpty()
                    if (serverUrl.isNotBlank()) {
                        val isPaused = !player.isPlaying.value
                        val title = channel.name + (if (!channel.currentProgram.isNullOrBlank()) " (${channel.currentProgram})" else "")
                        val api = networkClient?.createApiService(serverUrl)
                        val resp = api?.sendSessionHeartbeat(
                            com.lumiere.core.model.SessionHeartbeatRequest(
                                sessionId = newSessionId,
                                deviceType = "tv",
                                deviceName = deviceDisplayName,
                                mediaType = "iptv",
                                mediaId = channel.id,
                                mediaTitle = title,
                                mediaPoster = channel.logo,
                                currentTime = 0L,
                                duration = 0L,
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

    fun enterFullscreen(channel: IptvChannel? = null) {
        val target = channel ?: _uiState.value.focusedChannel ?: _uiState.value.activeChannel ?: return
        playChannel(target)
    }

    fun exitPlayerMode() {
        val target = _uiState.value.activeChannel ?: _uiState.value.focusedChannel
        _uiState.update {
            it.copy(
                isPlayerMode = false,
                isSidebarVisible = false,
                showChannelBanner = false,
                focusedChannel = target
            )
        }
        if (target != null) {
            onChannelFocused(target)
        }
        val closingSessionId = iptvSessionId
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
        iptvHeartbeatJob?.cancel()
        // In guide mode, keep preview muted
        player.exoPlayer.volume = 0f
    }

    // ========== Multi-View 50/50 Dual Player Mode ==========

    fun enterMultiView(secondaryChannel: IptvChannel? = null) {
        if (secondaryPlayer == null) {
            secondaryPlayer = LumierePlayer(getApplication<Application>().applicationContext, networkClient!!.okHttpClient)
        }

        val primary = _uiState.value.activeChannel ?: _uiState.value.focusedChannel ?: _uiState.value.allChannels.firstOrNull() ?: return
        val targetSecondary = secondaryChannel
            ?: _uiState.value.displayedChannels.firstOrNull { it.id != primary.id }
            ?: _uiState.value.allChannels.firstOrNull { it.id != primary.id }
            ?: primary

        _uiState.update {
            it.copy(
                isMultiViewMode = true,
                isPlayerMode = false,
                activeChannel = primary,
                multiViewSecondaryChannel = targetSecondary,
                multiViewAudioOnPrimary = true
            )
        }

        player.exoPlayer.volume = 1f
        secondaryPlayer?.exoPlayer?.volume = 0f

        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val encodedSec = URLEncoder.encode(targetSecondary.url, StandardCharsets.UTF_8.toString())
            val streamUrlSec = if (serverUrl.isNotBlank()) "$serverUrl/api/iptv/stream?url=$encodedSec" else targetSecondary.url
            val isHlsSec = targetSecondary.url.contains(".m3u", ignoreCase = true) || !targetSecondary.url.endsWith(".ts", ignoreCase = true)
            secondaryPlayer?.prepare(streamUrlSec, isHls = isHlsSec, startPositionMs = 0L, isLive = true)
        }
    }

    fun switchMultiViewAudio() {
        val newAudioOnPrimary = !_uiState.value.multiViewAudioOnPrimary
        _uiState.update { it.copy(multiViewAudioOnPrimary = newAudioOnPrimary) }
        if (newAudioOnPrimary) {
            player.exoPlayer.volume = 1f
            secondaryPlayer?.exoPlayer?.volume = 0f
        } else {
            player.exoPlayer.volume = 0f
            secondaryPlayer?.exoPlayer?.volume = 1f
        }
    }

    fun exitMultiView(fullscreenChannel: IptvChannel? = null) {
        val target = fullscreenChannel ?: if (_uiState.value.multiViewAudioOnPrimary) {
            _uiState.value.activeChannel
        } else {
            _uiState.value.multiViewSecondaryChannel
        }

        secondaryPlayer?.stop()
        secondaryPlayer?.release()
        secondaryPlayer = null

        _uiState.update {
            it.copy(
                isMultiViewMode = false,
                multiViewSecondaryChannel = null,
                multiViewAudioOnPrimary = true
            )
        }

        if (target != null) {
            playChannel(target)
        } else {
            exitPlayerMode()
        }
    }

    fun nextChannel() {
        val list = _uiState.value.displayedChannels
        if (list.isEmpty()) return
        val currentIdx = list.indexOfFirst { it.id == _uiState.value.activeChannel?.id }
        val nextIdx = if (currentIdx in 0 until list.size - 1) currentIdx + 1 else 0
        playChannel(list[nextIdx])
    }

    fun previousChannel() {
        val list = _uiState.value.displayedChannels
        if (list.isEmpty()) return
        val currentIdx = list.indexOfFirst { it.id == _uiState.value.activeChannel?.id }
        val prevIdx = if (currentIdx > 0) currentIdx - 1 else list.size - 1
        playChannel(list[prevIdx])
    }

    fun toggleSidebar() {
        _uiState.update { it.copy(isSidebarVisible = !it.isSidebarVisible) }
    }

    fun closeSidebar() {
        _uiState.update { it.copy(isSidebarVisible = false) }
    }

    private fun showBanner() {
        bannerJob?.cancel()
        _uiState.update { it.copy(showChannelBanner = true) }
        bannerJob = viewModelScope.launch {
            delay(4000)
            _uiState.update { it.copy(showChannelBanner = false) }
        }
    }

    fun resolveLogoUrl(logo: String?): String {
        return networkClient?.resolveImageUrl(logo) ?: logo.orEmpty()
    }

    override fun onCleared() {
        super.onCleared()
        val closingSessionId = iptvSessionId
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
        iptvHeartbeatJob?.cancel()
        bannerJob?.cancel()
        focusDebounceJob?.cancel()
        previewJob?.cancel()
        secondaryPlayer?.release()
        player.release()
    }
}

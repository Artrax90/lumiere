package com.lumiere.tv.ui.iptv

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
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
    val activeChannel: IptvChannel? = null,
    val isPlayerMode: Boolean = false,
    val isSidebarVisible: Boolean = false,
    val showChannelBanner: Boolean = false,
    val errorMessage: String? = null
)

class IptvViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    val player: LumierePlayer

    private val _uiState = MutableStateFlow(IptvUiState())
    val uiState: StateFlow<IptvUiState> = _uiState.asStateFlow()

    private var bannerJob: Job? = null

    init {
        networkClient = NetworkClient(
            baseUrlProvider = { runBlocking { preferences.serverUrl.first().orEmpty() } },
            tokenProvider = { runBlocking { preferences.accessToken.first() } }
        )

        player = LumierePlayer(application.applicationContext, networkClient!!.okHttpClient)

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
                val groups = if (res.groups.isNotEmpty()) res.groups else listOf("Все")

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        allChannels = channels,
                        displayedChannels = channels,
                        groups = groups,
                        activeChannel = channels.firstOrNull()
                    )
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

    private fun loadEpg(epgUrl: String, baseChannels: List<IptvChannel>, api: com.lumiere.core.network.LumiereApiService) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val epgRes = api.getEpg(mapOf("url" to epgUrl))
                val now = System.currentTimeMillis()

                val epgData = epgRes.epg
                val channelMap = epgRes.channelMap
                val iconMap = epgRes.iconMap

                val enrichedChannels = baseChannels.map { channel ->
                    var epgId: String? = null
                    if (!channel.tvgId.isNullOrBlank() && epgData.containsKey(channel.tvgId)) {
                        epgId = channel.tvgId
                    } else {
                        val cleanName = normalizeChannelName(channel.name)
                        epgId = channelMap[cleanName]
                        if (epgId == null || !epgData.containsKey(epgId)) {
                            epgId = channelMap.entries.firstOrNull { (k, id) ->
                                (cleanName.contains(k) || k.contains(cleanName)) && epgData.containsKey(id)
                            }?.value
                        }
                    }

                    if (epgId != null && epgData.containsKey(epgId)) {
                        val programs = epgData[epgId].orEmpty()
                        var curProg = programs.firstOrNull { prog ->
                            val s = parseEpgTime(prog.start)
                            val e = parseEpgTime(prog.stop)
                            s > 0 && e > 0 && now in s until e
                        }
                        if (curProg == null) {
                            curProg = programs.firstOrNull { prog ->
                                val s = parseEpgTime(prog.start)
                                s >= now
                            }
                        }

                        val curTitle = curProg?.let {
                            if (!it.startTime.isNullOrBlank()) "${it.startTime} ${it.title}" else it.title
                        }

                        val nextProg = curProg?.let { cp ->
                            val idx = programs.indexOf(cp)
                            if (idx in 0 until programs.size - 1) programs[idx + 1] else null
                        }
                        val nextTitle = nextProg?.let {
                            if (!it.startTime.isNullOrBlank()) "${it.startTime} ${it.title}" else it.title
                        }

                        val logo = if (channel.logo.isNullOrBlank()) {
                            iconMap[epgId] ?: "https://iptvx.one/picons/$epgId.png"
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
                        val filtered = if (group.isEmpty() || group == "Все") {
                            enrichedChannels
                        } else {
                            enrichedChannels.filter { it.group == group }
                        }
                        val updatedActive = current.activeChannel?.let { act ->
                            enrichedChannels.find { it.id == act.id } ?: act
                        } ?: enrichedChannels.firstOrNull()

                        current.copy(
                            allChannels = enrichedChannels,
                            displayedChannels = filtered,
                            activeChannel = updatedActive
                        )
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("LumiereTV", "EPG load failed: ${e.message}")
            }
        }
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

    fun selectGroup(group: String) {
        val filtered = if (group.isEmpty() || group == "Все") {
            _uiState.value.allChannels
        } else {
            _uiState.value.allChannels.filter { it.group == group }
        }

        _uiState.update {
            it.copy(
                selectedGroup = group,
                displayedChannels = filtered
            )
        }
    }

    fun playChannel(channel: IptvChannel) {
        _uiState.update { it.copy(activeChannel = channel, isPlayerMode = true, isSidebarVisible = false) }

        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            // Proxy stream via Lumiere server to ensure SSL/CORS/ISP bypass and playlist manifest rewriting
            val encoded = URLEncoder.encode(channel.url, StandardCharsets.UTF_8.toString())
            val streamUrl = "$serverUrl/api/iptv/stream?url=$encoded"
            player.prepare(streamUrl, isHls = true)
            showBanner()
        }
    }

    fun exitPlayerMode() {
        _uiState.update { it.copy(isPlayerMode = false, isSidebarVisible = false, showChannelBanner = false) }
        player.stop()
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
        bannerJob?.cancel()
        player.release()
    }
}

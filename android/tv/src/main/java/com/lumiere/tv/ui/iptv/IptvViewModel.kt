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
                val res = api.parseIptvPlaylist()
                val channels = res.channels
                val groups = res.groups

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        allChannels = channels,
                        displayedChannels = channels,
                        groups = groups,
                        activeChannel = channels.firstOrNull()
                    )
                }

                // Auto-start first channel
                channels.firstOrNull()?.let { playChannel(it) }
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
        _uiState.update { it.copy(activeChannel = channel, isSidebarVisible = false) }

        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            // Proxy stream via Lumiere server to ensure SSL/CORS/ISP bypass
            val encoded = URLEncoder.encode(channel.url, StandardCharsets.UTF_8.toString())
            val streamUrl = "$serverUrl/api/iptv/proxy?url=$encoded"
            player.prepare(streamUrl, isHls = true)
            showBanner()
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
        bannerJob?.cancel()
        player.release()
    }
}

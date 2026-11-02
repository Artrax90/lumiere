package com.lumiere.tv.ui.downloads

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.DiskInfo
import com.lumiere.core.model.ServerDownloadItem
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DownloadsUiState(
    val isLoading: Boolean = false,
    val downloads: List<ServerDownloadItem> = emptyList(),
    val disk: DiskInfo? = null,
    val errorMessage: String? = null
)

class DownloadsViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(DownloadsUiState())
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()

    init {
        loadDownloads()
    }

    fun loadDownloads() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            if (serverUrl.isBlank()) {
                _uiState.update { it.copy(isLoading = false, errorMessage = "Сервер не настроен") }
                return@launch
            }

            networkClient = NetworkClient(
                baseUrlProvider = { serverUrl },
                tokenProvider = { token },
                preferences = preferences
            )
            val api = networkClient!!.createApiService(serverUrl)

            try {
                val res = api.getServerDownloads()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        downloads = res.downloads,
                        disk = res.disk
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = "Ошибка загрузки: ${e.message}") }
            }
        }
    }

    suspend fun resolveStreamUrl(item: ServerDownloadItem): String {
        val serverUrl = preferences.serverUrl.first().orEmpty()
        return "$serverUrl/api/downloads/server/stream/${item.id}"
    }

    fun resolvePosterUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

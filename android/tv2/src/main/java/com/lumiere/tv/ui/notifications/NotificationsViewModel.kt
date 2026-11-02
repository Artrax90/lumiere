package com.lumiere.tv.ui.notifications

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.AppNotification
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NotificationsUiState(
    val isLoading: Boolean = false,
    val notifications: List<AppNotification> = emptyList(),
    val unreadCount: Int = 0,
    val errorMessage: String? = null
)

class NotificationsViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    init {
        loadNotifications()
    }

    fun loadNotifications() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            val userId = preferences.activeProfileId.first()

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
                val res = api.getNotifications(userId)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        notifications = res.notifications,
                        unreadCount = res.unreadCount
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Ошибка загрузки уведомлений: ${e.message}"
                    )
                }
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank()) return@launch
            val api = networkClient?.createApiService(serverUrl) ?: return@launch
            try {
                api.markAllNotificationsRead()
                _uiState.update { state ->
                    state.copy(
                        unreadCount = 0,
                        notifications = state.notifications.map { it.copy(isRead = true) }
                    )
                }
            } catch (_: Exception) {}
        }
    }

    fun markRead(id: Long) {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank()) return@launch
            val api = networkClient?.createApiService(serverUrl) ?: return@launch
            try {
                api.markNotificationRead(id)
                _uiState.update { state ->
                    state.copy(
                        unreadCount = (state.unreadCount - 1).coerceAtLeast(0),
                        notifications = state.notifications.map {
                            if (it.id == id) it.copy(isRead = true) else it
                        }
                    )
                }
            } catch (_: Exception) {}
        }
    }

    fun resolvePosterUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

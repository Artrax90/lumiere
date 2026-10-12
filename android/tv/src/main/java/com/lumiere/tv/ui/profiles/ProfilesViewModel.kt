package com.lumiere.tv.ui.profiles

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.Profile
import com.lumiere.core.model.QuickLoginRequest
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfilesUiState(
    val isLoading: Boolean = false,
    val profiles: List<Profile> = emptyList(),
    val selectedProfileForPin: Profile? = null,
    val pinError: String? = null,
    val errorMessage: String? = null
)

class ProfilesViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(ProfilesUiState())
    val uiState: StateFlow<ProfilesUiState> = _uiState.asStateFlow()

    init {
        loadProfiles()
    }

    fun loadProfiles() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank()) {
                _uiState.update { it.copy(isLoading = false, errorMessage = "Сервер не настроен") }
                return@launch
            }

            networkClient = NetworkClient(
                baseUrlProvider = { serverUrl },
                tokenProvider = { null }
            )

            try {
                val api = networkClient!!.createApiService(serverUrl)
                val response = api.getProfiles()
                _uiState.update { it.copy(isLoading = false, profiles = response.profiles) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Не удалось загрузить профили: ${e.message}"
                    )
                }
            }
        }
    }

    fun onProfileSelected(profile: Profile, onSuccess: () -> Unit) {
        if (profile.hasPin) {
            _uiState.update { it.copy(selectedProfileForPin = profile, pinError = null) }
        } else {
            performQuickLogin(profile, pin = null, onSuccess = onSuccess)
        }
    }

    fun submitPin(pin: String, onSuccess: () -> Unit) {
        val target = _uiState.value.selectedProfileForPin ?: return
        performQuickLogin(target, pin = pin, onSuccess = onSuccess)
    }

    private fun performQuickLogin(profile: Profile, pin: String?, onSuccess: () -> Unit) {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val authRes = api.quickLogin(QuickLoginRequest(userId = profile.id, pin = pin))
                preferences.setTokens(authRes.accessToken, authRes.refreshToken)
                preferences.setActiveProfile(
                    id = authRes.user.id,
                    name = authRes.user.name,
                    avatar = authRes.user.avatar,
                    isKids = authRes.user.isKids
                )
                _uiState.update { it.copy(selectedProfileForPin = null, pinError = null) }
                onSuccess()
            } catch (e: Exception) {
                if (profile.hasPin) {
                    _uiState.update { it.copy(pinError = "Неверный PIN-код") }
                } else {
                    _uiState.update { it.copy(errorMessage = "Ошибка входа: ${e.message}") }
                }
            }
        }
    }

    fun dismissPinDialog() {
        _uiState.update { it.copy(selectedProfileForPin = null, pinError = null) }
    }

    fun changeServer(onServerCleared: () -> Unit) {
        viewModelScope.launch {
            preferences.clearServerUrl()
            onServerCleared()
        }
    }
}

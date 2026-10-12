package com.lumiere.tv.ui.connect

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.network.ServerDiscovery
import com.lumiere.core.network.ServerDiscovery.DiscoveredServer
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConnectUiState(
    val isScanning: Boolean = false,
    val scannedCount: Int = 0,
    val totalCount: Int = 0,
    val discoveredServer: DiscoveredServer? = null,
    val manualAddress: String = "192.168.1.",
    val isConnecting: Boolean = false,
    val errorMessage: String? = null
)

class ConnectViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private val discovery = ServerDiscovery()

    private val _uiState = MutableStateFlow(ConnectUiState())
    val uiState: StateFlow<ConnectUiState> = _uiState.asStateFlow()

    init {
        startDiscovery()
    }

    fun startDiscovery() {
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, errorMessage = null, discoveredServer = null) }
            val server = discovery.discoverLocalServer { current, total ->
                _uiState.update { it.copy(scannedCount = current, totalCount = total) }
            }
            _uiState.update {
                it.copy(
                    isScanning = false,
                    discoveredServer = server,
                    manualAddress = server?.url?.removePrefix("http://") ?: it.manualAddress
                )
            }
        }
    }

    fun connect(rawUrl: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isConnecting = true, errorMessage = null) }

            var sanitized = rawUrl.trim()
            if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
                sanitized = "http://$sanitized"
            }
            if (!sanitized.contains(":")) {
                sanitized = "$sanitized:3500"
            }

            val isHealthy = discovery.checkHealth(sanitized)
            if (isHealthy) {
                preferences.setServerUrl(sanitized)
                _uiState.update { it.copy(isConnecting = false) }
                onSuccess()
            } else {
                _uiState.update {
                    it.copy(
                        isConnecting = false,
                        errorMessage = "Не удалось подключиться к серверу $sanitized. Проверьте адрес и сеть."
                    )
                }
            }
        }
    }

    fun updateManualAddress(address: String) {
        _uiState.update { it.copy(manualAddress = address) }
    }
}

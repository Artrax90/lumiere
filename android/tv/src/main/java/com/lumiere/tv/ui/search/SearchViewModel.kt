package com.lumiere.tv.ui.search

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.Title
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update

data class SearchUiState(
    val query: String = "",
    val results: List<Title> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            networkClient = NetworkClient(
                baseUrlProvider = { serverUrl },
                tokenProvider = { token }
            )
        }
    }

    fun onChar(c: Char) {
        val updated = _uiState.value.query + c
        updateQuery(updated)
    }

    fun onSpace() {
        val updated = _uiState.value.query + " "
        updateQuery(updated)
    }

    fun onBackspace() {
        if (_uiState.value.query.isNotEmpty()) {
            val updated = _uiState.value.query.dropLast(1)
            updateQuery(updated)
        }
    }

    fun onClear() {
        updateQuery("")
    }

    private fun updateQuery(newQuery: String) {
        _uiState.update { it.copy(query = newQuery) }

        searchJob?.cancel()
        if (newQuery.trim().length < 2) {
            _uiState.update { it.copy(results = emptyList(), isLoading = false) }
            return
        }

        searchJob = viewModelScope.launch {
            delay(350)
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val res = api.searchTitles(newQuery.trim())
                _uiState.update { it.copy(results = res.results, isLoading = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Ошибка поиска: ${e.message}"
                    )
                }
            }
        }
    }

    fun resolvePosterUrl(poster: String?): String {
        return networkClient?.resolveImageUrl(poster) ?: poster.orEmpty()
    }
}

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
    val activeSource: String = "tmdb", // "tmdb" or "kp"
    val tmdbResults: List<Title> = emptyList(),
    val tmdbCount: Int = 0,
    val kpResults: List<Title> = emptyList(),
    val kpCount: Int = 0,
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

    fun setSource(source: String) {
        if (_uiState.value.activeSource == source) return
        val activeList = if (source == "kp") _uiState.value.kpResults else _uiState.value.tmdbResults
        _uiState.update {
            it.copy(
                activeSource = source,
                results = activeList
            )
        }
    }

    private fun updateQuery(newQuery: String) {
        _uiState.update { it.copy(query = newQuery) }

        searchJob?.cancel()
        if (newQuery.trim().length < 2) {
            _uiState.update {
                it.copy(
                    results = emptyList(),
                    tmdbResults = emptyList(),
                    tmdbCount = 0,
                    kpResults = emptyList(),
                    kpCount = 0,
                    isLoading = false
                )
            }
            return
        }

        searchJob = viewModelScope.launch {
            delay(350)
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val res = api.searchTitles(query = newQuery.trim(), source = "all")
                val tmdbList = res.tmdb?.results ?: res.results
                val tmdbCnt = res.tmdb?.count ?: tmdbList.size
                val kpList = res.kp?.results ?: emptyList()
                val kpCnt = res.kp?.count ?: kpList.size

                var targetSource = _uiState.value.activeSource
                if (targetSource == "tmdb" && tmdbList.isEmpty() && kpList.isNotEmpty()) {
                    targetSource = "kp"
                } else if (targetSource == "kp" && kpList.isEmpty() && tmdbList.isNotEmpty()) {
                    targetSource = "tmdb"
                }

                val activeList = if (targetSource == "kp") kpList else tmdbList

                _uiState.update {
                    it.copy(
                        activeSource = targetSource,
                        tmdbResults = tmdbList,
                        tmdbCount = tmdbCnt,
                        kpResults = kpList,
                        kpCount = kpCnt,
                        results = activeList,
                        isLoading = false
                    )
                }
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

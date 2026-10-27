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
    val isLoadingMore: Boolean = false,
    val errorMessage: String? = null
)

class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null
    private var tmdbPage = 1
    private var kpPage = 1
    private var hasMoreTmdb = true
    private var hasMoreKp = true

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
        tmdbPage = 1
        kpPage = 1
        hasMoreTmdb = true
        hasMoreKp = true

        if (newQuery.trim().length < 2) {
            _uiState.update {
                it.copy(
                    results = emptyList(),
                    tmdbResults = emptyList(),
                    tmdbCount = 0,
                    kpResults = emptyList(),
                    kpCount = 0,
                    isLoading = false,
                    isLoadingMore = false
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
                val qTrim = newQuery.trim()
                val res = api.searchTitles(query = qTrim, source = "all", page = 1)
                var tmdbList = (res.tmdb?.results ?: res.results).map { it.copy(source = "tmdb") }
                val tmdbCnt = res.tmdb?.count ?: tmdbList.size
                var kpList = (res.kp?.results ?: emptyList()).map { it.copy(source = "kp") }
                val kpCnt = res.kp?.count ?: kpList.size

                // Eagerly prefetch page 2 in parallel if more results exist
                if (tmdbCnt > tmdbList.size) {
                    try {
                        val p2Tmdb = api.searchTitles(query = qTrim, source = "tmdb", page = 2)
                        val extra = (p2Tmdb.results.ifEmpty { p2Tmdb.tmdb?.results ?: emptyList() }).map { it.copy(source = "tmdb") }
                        val existingIds = tmdbList.map { it.id }.toSet()
                        tmdbList = tmdbList + extra.filter { it.id !in existingIds }
                        tmdbPage = 2
                    } catch (_: Exception) {}
                }
                if (kpCnt > kpList.size) {
                    try {
                        val p2Kp = api.searchTitles(query = qTrim, source = "kp", page = 2)
                        val extra = (p2Kp.results.ifEmpty { p2Kp.kp?.results ?: emptyList() }).map { it.copy(source = "kp") }
                        val existingIds = kpList.map { it.id }.toSet()
                        kpList = kpList + extra.filter { it.id !in existingIds }
                        kpPage = 2
                    } catch (_: Exception) {}
                }

                hasMoreTmdb = tmdbList.size < tmdbCnt
                hasMoreKp = kpList.size < kpCnt

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

    fun loadMoreResults() {
        val q = _uiState.value.query.trim()
        if (q.length < 2 || _uiState.value.isLoading || _uiState.value.isLoadingMore) return
        val isKp = _uiState.value.activeSource == "kp"
        if (isKp && !hasMoreKp) return
        if (!isKp && !hasMoreTmdb) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                if (isKp) {
                    val nextPage = kpPage + 1
                    val res = api.searchTitles(query = q, source = "kp", page = nextPage)
                    val newItems = (res.results.ifEmpty { res.kp?.results ?: emptyList() }).map { it.copy(source = "kp") }
                    if (newItems.isEmpty()) {
                        hasMoreKp = false
                    } else {
                        kpPage = nextPage
                        val currentIds = _uiState.value.kpResults.map { it.id }.toSet()
                        val deduped = newItems.filter { it.id !in currentIds }
                        val updatedKp = _uiState.value.kpResults + deduped
                        hasMoreKp = updatedKp.size < _uiState.value.kpCount
                        _uiState.update {
                            it.copy(
                                kpResults = updatedKp,
                                results = if (it.activeSource == "kp") updatedKp else it.results
                            )
                        }
                    }
                } else {
                    val nextPage = tmdbPage + 1
                    val res = api.searchTitles(query = q, source = "tmdb", page = nextPage)
                    val newItems = (res.results.ifEmpty { res.tmdb?.results ?: emptyList() }).map { it.copy(source = "tmdb") }
                    if (newItems.isEmpty()) {
                        hasMoreTmdb = false
                    } else {
                        tmdbPage = nextPage
                        val currentIds = _uiState.value.tmdbResults.map { it.id }.toSet()
                        val deduped = newItems.filter { it.id !in currentIds }
                        val updatedTmdb = _uiState.value.tmdbResults + deduped
                        hasMoreTmdb = updatedTmdb.size < _uiState.value.tmdbCount
                        _uiState.update {
                            it.copy(
                                tmdbResults = updatedTmdb,
                                results = if (it.activeSource == "tmdb") updatedTmdb else it.results
                            )
                        }
                    }
                }
            } catch (_: Exception) {} finally {
                _uiState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun resolvePosterUrl(poster: String?): String {
        return networkClient?.resolveImageUrl(poster) ?: poster.orEmpty()
    }
}

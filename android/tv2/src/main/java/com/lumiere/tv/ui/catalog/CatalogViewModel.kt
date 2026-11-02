package com.lumiere.tv.ui.catalog

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.Genre
import com.lumiere.core.model.Title
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CatalogUiState(
    val isLoading: Boolean = false,
    val genres: List<Genre> = emptyList(),
    val selectedGenreId: Int? = null,
    val titles: List<Title> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1
)

class CatalogViewModel(
    application: Application,
    val mediaType: String = "movie"
) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(CatalogUiState())
    val uiState: StateFlow<CatalogUiState> = _uiState.asStateFlow()

    init {
        loadGenresAndInitialTitles()
    }

    private fun loadGenresAndInitialTitles() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            if (serverUrl.isBlank()) return@launch

            networkClient = NetworkClient(
                baseUrlProvider = { serverUrl },
                tokenProvider = { token },
                preferences = preferences
            )
            val api = networkClient!!.createApiService(serverUrl)

            try {
                val genresRes = api.getGenres(type = mediaType)
                val list = genresRes.genres
                _uiState.update { it.copy(genres = list) }

                loadTitles(genreId = null, page = 1)
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun selectGenre(genreId: Int?) {
        if (_uiState.value.selectedGenreId == genreId) return
        _uiState.update { it.copy(selectedGenreId = genreId, page = 1, titles = emptyList()) }
        loadTitles(genreId = genreId, page = 1)
    }

    fun loadNextPage() {
        val current = _uiState.value
        if (current.isLoading || current.page >= current.totalPages) return
        loadTitles(genreId = current.selectedGenreId, page = current.page + 1)
    }

    private fun loadTitles(genreId: Int?, page: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val res = if (genreId != null) {
                    if (mediaType == "tv") api.getTvByGenre(genreId, page) else api.getMoviesByGenre(genreId, page)
                } else {
                    if (mediaType == "tv") api.getPopularTv(page) else api.getPopularMovies(page)
                }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        titles = if (page == 1) res.results else (it.titles + res.results).distinctBy { item -> item.id },
                        page = page,
                        totalPages = res.totalPages ?: 1
                    )
                }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun resolvePosterUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

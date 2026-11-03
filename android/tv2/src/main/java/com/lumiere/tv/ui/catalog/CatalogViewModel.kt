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

data class SortOption(
    val id: String,
    val title: String
)

data class CatalogUiState(
    val isLoading: Boolean = false,
    val genres: List<Genre> = emptyList(),
    val selectedGenreId: Int? = null,
    val selectedYear: Int? = null,
    val selectedSort: String = "popularity.desc",
    val sortOptions: List<SortOption> = emptyList(),
    val availableYears: List<Int?> = emptyList(),
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

    private val defaultSortOptions = listOf(
        SortOption("popularity.desc", "Популярные"),
        SortOption("vote_average.desc", "Рейтинг"),
        SortOption("primary_release_date.desc", "Новинки")
    )

    private val defaultYears: List<Int?> = listOf(
        null, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2015, 2010
    )

    private val _uiState = MutableStateFlow(
        CatalogUiState(
            sortOptions = defaultSortOptions,
            availableYears = defaultYears
        )
    )
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

                loadTitles(
                    genreId = _uiState.value.selectedGenreId,
                    year = _uiState.value.selectedYear,
                    sortBy = _uiState.value.selectedSort,
                    page = 1
                )
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun selectGenre(genreId: Int?) {
        if (_uiState.value.selectedGenreId == genreId) return
        _uiState.update { it.copy(selectedGenreId = genreId, page = 1, titles = emptyList()) }
        loadTitles(
            genreId = genreId,
            year = _uiState.value.selectedYear,
            sortBy = _uiState.value.selectedSort,
            page = 1
        )
    }

    fun selectYear(year: Int?) {
        if (_uiState.value.selectedYear == year) return
        _uiState.update { it.copy(selectedYear = year, page = 1, titles = emptyList()) }
        loadTitles(
            genreId = _uiState.value.selectedGenreId,
            year = year,
            sortBy = _uiState.value.selectedSort,
            page = 1
        )
    }

    fun selectSort(sortId: String) {
        if (_uiState.value.selectedSort == sortId) return
        _uiState.update { it.copy(selectedSort = sortId, page = 1, titles = emptyList()) }
        loadTitles(
            genreId = _uiState.value.selectedGenreId,
            year = _uiState.value.selectedYear,
            sortBy = sortId,
            page = 1
        )
    }

    fun loadNextPage() {
        val current = _uiState.value
        if (current.isLoading || current.page >= current.totalPages) return
        loadTitles(
            genreId = current.selectedGenreId,
            year = current.selectedYear,
            sortBy = current.selectedSort,
            page = current.page + 1
        )
    }

    private fun loadTitles(genreId: Int?, year: Int?, sortBy: String, page: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val effectiveSort = if (mediaType == "tv" && sortBy.startsWith("primary_release_date")) {
                    "first_air_date.desc"
                } else {
                    sortBy
                }

                val res = try {
                    if (mediaType == "tv") {
                        api.discoverTv(
                            genre = genreId,
                            year = year,
                            sortBy = effectiveSort,
                            page = page
                        )
                    } else {
                        api.discoverMovies(
                            genre = genreId,
                            year = year,
                            sortBy = effectiveSort,
                            page = page
                        )
                    }
                } catch (_: Exception) {
                    // Fallback to basic endpoints if discover fails
                    if (genreId != null) {
                        if (mediaType == "tv") api.getTvByGenre(genreId, page) else api.getMoviesByGenre(genreId, page)
                    } else {
                        if (mediaType == "tv") api.getPopularTv(page) else api.getPopularMovies(page)
                    }
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

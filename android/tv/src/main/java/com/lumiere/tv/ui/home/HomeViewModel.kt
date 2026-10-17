package com.lumiere.tv.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.Title
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val isLoading: Boolean = false,
    val heroItem: Title? = null,
    val continueWatching: List<Title> = emptyList(),
    val trendingMovies: List<Title> = emptyList(),
    val popularMovies: List<Title> = emptyList(),
    val netflixMoviesWeek: List<Title> = emptyList(),
    val netflixMoviesAllTime: List<Title> = emptyList(),
    val netflixMoviesPeriod: String = "week",
    val trendingSeries: List<Title> = emptyList(),
    val popularSeries: List<Title> = emptyList(),
    val netflixSeriesWeek: List<Title> = emptyList(),
    val netflixSeriesAllTime: List<Title> = emptyList(),
    val netflixSeriesPeriod: String = "week",
    val profileName: String? = null,
    val profileAvatar: String? = null,
    val unreadNotificationsCount: Int = 0,
    val errorMessage: String? = null
) {
    val netflixMovies: List<Title>
        get() = if (netflixMoviesPeriod == "all_time") netflixMoviesAllTime else netflixMoviesWeek

    val netflixSeries: List<Title>
        get() = if (netflixSeriesPeriod == "all_time") netflixSeriesAllTime else netflixSeriesWeek
}

class HomeViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadHomeData()
    }

    fun setNetflixMoviesPeriod(period: String) {
        _uiState.update { it.copy(netflixMoviesPeriod = period) }
        if (period == "all_time" && _uiState.value.netflixMoviesAllTime.isEmpty()) {
            loadNetflixMoviesAllTime()
        }
    }

    fun setNetflixSeriesPeriod(period: String) {
        _uiState.update { it.copy(netflixSeriesPeriod = period) }
        if (period == "all_time" && _uiState.value.netflixSeriesAllTime.isEmpty()) {
            loadNetflixSeriesAllTime()
        }
    }

    private fun loadNetflixMoviesAllTime() {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank() || networkClient == null) return@launch
            val api = networkClient!!.createApiService(serverUrl)
            val res = runCatching { api.getNetflixMovies(page = 1, period = "all_time") }.getOrNull()
            if (res != null) {
                _uiState.update { it.copy(netflixMoviesAllTime = res.results) }
            }
        }
    }

    private fun loadNetflixSeriesAllTime() {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank() || networkClient == null) return@launch
            val api = networkClient!!.createApiService(serverUrl)
            val res = runCatching { api.getNetflixTv(page = 1, period = "all_time") }.getOrNull()
            if (res != null) {
                _uiState.update { it.copy(netflixSeriesAllTime = res.results) }
            }
        }
    }

    fun loadHomeData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            val profileName = preferences.activeProfileName.first()
            val profileAvatar = preferences.activeProfileAvatar.first()

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
                // Fetch catalogs in parallel
                val trendingMoviesDeferred = async { runCatching { api.getTrendingMovies() }.getOrNull() }
                val popularMoviesDeferred = async { runCatching { api.getPopularMovies() }.getOrNull() }
                val netflixMoviesWeekDeferred = async { runCatching { api.getNetflixMovies(page = 1, period = "week") }.getOrNull() }
                val netflixMoviesAllTimeDeferred = async { runCatching { api.getNetflixMovies(page = 1, period = "all_time") }.getOrNull() }
                val trendingTvDeferred = async { runCatching { api.getTrendingTv() }.getOrNull() }
                val popularTvDeferred = async { runCatching { api.getPopularTv() }.getOrNull() }
                val netflixTvWeekDeferred = async { runCatching { api.getNetflixTv(page = 1, period = "week") }.getOrNull() }
                val netflixTvAllTimeDeferred = async { runCatching { api.getNetflixTv(page = 1, period = "all_time") }.getOrNull() }
                val syncDeferred = async { runCatching { api.pullSync() }.getOrNull() }
                val notifsDeferred = async { runCatching { api.getNotifications() }.getOrNull() }

                val trendingMovies = trendingMoviesDeferred.await()?.results.orEmpty()
                val popularMovies = popularMoviesDeferred.await()?.results.orEmpty()
                val netflixMoviesWeek = netflixMoviesWeekDeferred.await()?.results.orEmpty()
                val netflixMoviesAllTime = netflixMoviesAllTimeDeferred.await()?.results.orEmpty()
                val trendingTv = trendingTvDeferred.await()?.results.orEmpty()
                val popularTv = popularTvDeferred.await()?.results.orEmpty()
                val netflixTvWeek = netflixTvWeekDeferred.await()?.results.orEmpty()
                val netflixTvAllTime = netflixTvAllTimeDeferred.await()?.results.orEmpty()
                val syncData = syncDeferred.await()
                val notifsData = notifsDeferred.await()

                // Map watch history to Titles for continue watching row
                val continueWatching = syncData?.watchHistory?.map { item ->
                    Title(
                        id = item.tmdbId,
                        tmdbId = item.tmdbId,
                        name = item.titleName,
                        type = item.mediaType,
                        poster = item.poster,
                        progress = (item.progress ?: 0L).toDouble()
                    )
                }.orEmpty()

                val hero = trendingMovies.firstOrNull { !it.backdrop.isNullOrBlank() }
                    ?: trendingMovies.firstOrNull()
                    ?: trendingTv.firstOrNull()

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        heroItem = hero,
                        continueWatching = continueWatching,
                        trendingMovies = trendingMovies,
                        popularMovies = popularMovies,
                        netflixMoviesWeek = netflixMoviesWeek,
                        netflixMoviesAllTime = netflixMoviesAllTime,
                        trendingSeries = trendingTv,
                        popularSeries = popularTv,
                        netflixSeriesWeek = netflixTvWeek,
                        netflixSeriesAllTime = netflixTvAllTime,
                        profileName = profileName,
                        profileAvatar = profileAvatar,
                        unreadNotificationsCount = notifsData?.unreadCount ?: 0
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Ошибка загрузки каталога: ${e.message}"
                    )
                }
            }
        }
    }

    fun resolveImageUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

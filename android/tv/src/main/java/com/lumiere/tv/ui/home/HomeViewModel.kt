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
    val trendingSeries: List<Title> = emptyList(),
    val popularSeries: List<Title> = emptyList(),
    val profileName: String? = null,
    val profileAvatar: String? = null,
    val errorMessage: String? = null
)

class HomeViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadHomeData()
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
                tokenProvider = { token }
            )

            val api = networkClient!!.createApiService(serverUrl)

            try {
                // Fetch catalogs in parallel
                val trendingMoviesDeferred = async { runCatching { api.getTrendingMovies() }.getOrNull() }
                val popularMoviesDeferred = async { runCatching { api.getPopularMovies() }.getOrNull() }
                val trendingTvDeferred = async { runCatching { api.getTrendingTv() }.getOrNull() }
                val popularTvDeferred = async { runCatching { api.getPopularTv() }.getOrNull() }
                val syncDeferred = async { runCatching { api.pullSync() }.getOrNull() }

                val trendingMovies = trendingMoviesDeferred.await()?.results.orEmpty()
                val popularMovies = popularMoviesDeferred.await()?.results.orEmpty()
                val trendingTv = trendingTvDeferred.await()?.results.orEmpty()
                val popularTv = popularTvDeferred.await()?.results.orEmpty()
                val syncData = syncDeferred.await()

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
                        trendingSeries = trendingTv,
                        popularSeries = popularTv,
                        profileName = profileName,
                        profileAvatar = profileAvatar
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

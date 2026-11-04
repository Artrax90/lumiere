package com.lumiere.tv.ui.profile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.Title
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileUiState(
    val isLoading: Boolean = false,
    val userName: String = "",
    val userEmail: String = "",
    val avatarUrl: String? = null,
    val isKids: Boolean = false,
    val totalWatchSeconds: Long = 0L,
    val totalWatchMinutes: Long = 0L,
    val totalWatchHours: Double = 0.0,
    val watchedTitlesCount: Int = 0,
    val moviesCount: Int = 0,
    val seriesCount: Int = 0,
    val episodesCount: Int = 0,
    val primaryDevice: String = "Smart TV",
    val favoriteGenres: List<com.lumiere.core.model.GenreStatItem> = emptyList(),
    val favorites: List<Title> = emptyList(),
    val errorMessage: String? = null
)

class ProfileViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfileData()
    }

    fun loadProfileData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            val profileId = preferences.activeProfileId.first() ?: 1L
            val name = preferences.activeProfileName.first() ?: "Пользователь"
            val avatar = preferences.activeProfileAvatar.first()
            val isKids = preferences.isKids.first()

            val resolvedAvatar = if (!avatar.isNullOrBlank() && !avatar.startsWith("http")) {
                "$serverUrl$avatar"
            } else avatar

            _uiState.update {
                it.copy(
                    userName = name,
                    avatarUrl = resolvedAvatar,
                    isKids = isKids
                )
            }

            if (serverUrl.isBlank() || token.isNullOrBlank()) {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            networkClient = NetworkClient(
                baseUrlProvider = { serverUrl },
                tokenProvider = { token }
            )

            try {
                val api = networkClient!!.createApiService(serverUrl)

                // 1. Load favorites
                val favRes = try {
                    api.getFavorites(profileId)
                } catch (_: Exception) {
                    null
                }

                val favTitles = favRes?.favorites?.map { f ->
                    Title(
                        id = f.tmdbId,
                        name = f.titleName.orEmpty(),
                        type = f.mediaType ?: "movie",
                        poster = f.poster ?: "",
                        backdrop = f.poster ?: "",
                        year = null,
                        score = null,
                        genres = emptyList(),
                        overview = null,
                        runtime = null,
                        rating = null,
                        seasonsCount = null
                    )
                } ?: emptyList()

                // 2. Load real synchronized watch stats from server
                val statsRes = try {
                    api.getUserStats(profileId)
                } catch (_: Exception) {
                    null
                }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        favorites = favTitles,
                        totalWatchSeconds = statsRes?.totalWatchSeconds ?: 0L,
                        totalWatchMinutes = statsRes?.totalWatchMinutes ?: 0L,
                        totalWatchHours = statsRes?.totalWatchHours ?: 0.0,
                        watchedTitlesCount = statsRes?.watchedCount ?: favTitles.size,
                        moviesCount = statsRes?.moviesCount ?: 0,
                        seriesCount = statsRes?.seriesCount ?: 0,
                        episodesCount = statsRes?.episodesCount ?: 0,
                        primaryDevice = statsRes?.primaryDevice?.ifBlank { "Smart TV" } ?: "Smart TV",
                        favoriteGenres = statsRes?.favoriteGenres ?: emptyList()
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = e.message) }
            }
        }
    }

    fun logout(onComplete: () -> Unit) {
        viewModelScope.launch {
            preferences.clearTokens()
            onComplete()
        }
    }

    fun resolvePosterUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

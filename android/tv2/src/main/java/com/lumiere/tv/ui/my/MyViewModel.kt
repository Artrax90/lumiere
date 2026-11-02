package com.lumiere.tv.ui.my

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

enum class MyTab(val title: String) {
    HISTORY("История"),
    WATCHLIST("Буду смотреть"),
    FAVORITES("Избранное")
}

data class MyUiState(
    val isLoading: Boolean = false,
    val selectedTab: MyTab = MyTab.HISTORY,
    val items: List<Title> = emptyList(),
    val errorMessage: String? = null
)

class MyViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(MyUiState())
    val uiState: StateFlow<MyUiState> = _uiState.asStateFlow()

    init {
        loadTab(MyTab.HISTORY)
    }

    fun selectTab(tab: MyTab) {
        if (_uiState.value.selectedTab == tab) return
        _uiState.update { it.copy(selectedTab = tab) }
        loadTab(tab)
    }

    fun loadTab(tab: MyTab) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
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
                val titles = when (tab) {
                    MyTab.HISTORY -> {
                        val res = api.getUserHistory()
                        res.history.map { h ->
                            Title(
                                id = h.tmdbId,
                                tmdbId = h.tmdbId,
                                name = h.titleName ?: "Без названия",
                                type = h.mediaType ?: "movie",
                                poster = h.poster,
                                progress = (h.progress ?: 0L).toDouble()
                            )
                        }
                    }
                    MyTab.WATCHLIST -> {
                        val res = api.getWatchlist()
                        res.watchlist.map { w ->
                            Title(
                                id = w.tmdbId,
                                tmdbId = w.tmdbId,
                                name = w.titleName ?: "Без названия",
                                type = w.mediaType ?: "movie",
                                poster = w.poster,
                                score = w.score
                            )
                        }
                    }
                    MyTab.FAVORITES -> {
                        val res = api.getFavorites()
                        res.favorites.map { f ->
                            Title(
                                id = f.tmdbId,
                                tmdbId = f.tmdbId,
                                name = f.titleName ?: "Без названия",
                                type = f.mediaType ?: "movie",
                                poster = f.poster
                            )
                        }
                    }
                }

                _uiState.update { it.copy(isLoading = false, items = titles) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = "Ошибка загрузки: ${e.message}") }
            }
        }
    }

    fun resolvePosterUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

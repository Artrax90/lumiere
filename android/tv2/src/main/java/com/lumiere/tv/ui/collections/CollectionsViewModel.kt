package com.lumiere.tv.ui.collections

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

data class CollectionCategory(
    val id: String,
    val name: String,
    val subtitle: String,
    val genreId: Int? = null,
    val isTopRated: Boolean = false,
    val isNetflixMovies: Boolean = false,
    val isNetflixTv: Boolean = false
)

data class CollectionsUiState(
    val isLoading: Boolean = false,
    val netflixPeriod: String = "week",
    val collections: Map<String, List<Title>> = emptyMap()
)

val CURATED_COLLECTIONS = listOf(
    CollectionCategory("netflix_movies", "Топ фильмы Netflix", "Главные кинохиты и оригинальные премьеры стриминга", isNetflixMovies = true),
    CollectionCategory("netflix_tv", "Топ сериалы Netflix", "Популярные оригинальные сериалы и хиты недели", isNetflixTv = true),
    CollectionCategory("masterpieces", "Шедевры мирового кино", "Высочайшие оценки и признание критиков", isTopRated = true),
    CollectionCategory("scifi", "Вселенная Sci-Fi", "Космос, будущее и параллельные миры", genreId = 878),
    CollectionCategory("action", "Боевики и Экшн", "Драйв, погони и масштабные баталии", genreId = 28),
    CollectionCategory("thrillers", "Остросюжетные триллеры", "Напряжение до последней секунды", genreId = 53),
    CollectionCategory("anime", "Аниме и Анимация", "Шедевры восточной анимации", genreId = 16),
    CollectionCategory("comedy", "Комедии и Юмор", "Отличное настроение и море улыбок", genreId = 35),
    CollectionCategory("crime", "Криминал и Гангстеры", "Улицы, тайны и моральные дилеммы", genreId = 80),
    CollectionCategory("horror", "Ужасы и Хорроры", "Загадочные явления и леденящий страх", genreId = 27)
)

class CollectionsViewModel(application: Application) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(CollectionsUiState())
    val uiState: StateFlow<CollectionsUiState> = _uiState.asStateFlow()

    init {
        loadAllCollections()
    }

    fun setNetflixPeriod(period: String) {
        if (_uiState.value.netflixPeriod == period) return
        _uiState.update { it.copy(netflixPeriod = period) }
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isBlank() || networkClient == null) return@launch
            val api = networkClient!!.createApiService(serverUrl)
            val movies = runCatching { api.getNetflixMovies(page = 1, period = period).results }.getOrNull()
            val tv = runCatching { api.getNetflixTv(page = 1, period = period).results }.getOrNull()
            _uiState.update { state ->
                val updated = state.collections.toMutableMap()
                if (movies != null) updated["netflix_movies"] = movies
                if (tv != null) updated["netflix_tv"] = tv
                state.copy(collections = updated)
            }
        }
    }

    private fun loadAllCollections() {
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

            val loaded = mutableMapOf<String, List<Title>>()
            for (category in CURATED_COLLECTIONS) {
                try {
                    val titles = when {
                        category.isNetflixMovies -> api.getNetflixMovies(page = 1, period = _uiState.value.netflixPeriod).results
                        category.isNetflixTv -> api.getNetflixTv(page = 1, period = _uiState.value.netflixPeriod).results
                        category.isTopRated -> api.getTopRatedMovies(page = 1).results
                        category.genreId != null -> api.getMoviesByGenre(category.genreId, page = 1).results
                        else -> emptyList()
                    }
                    if (titles.isNotEmpty()) {
                        loaded[category.id] = titles
                    }
                } catch (_: Exception) {}
            }

            _uiState.update { it.copy(isLoading = false, collections = loaded) }
        }
    }

    fun resolvePosterUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

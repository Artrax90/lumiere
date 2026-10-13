package com.lumiere.tv.ui.details

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.Episode
import com.lumiere.core.model.Title
import com.lumiere.core.model.TorrentItem
import com.lumiere.core.model.TorrentStreamRequest
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DetailsUiState(
    val isLoading: Boolean = false,
    val title: Title? = null,
    val selectedSeason: Int = 1,
    val episodes: List<Episode> = emptyList(),
    val torrents: List<TorrentItem> = emptyList(),
    val isSearchingTorrents: Boolean = false,
    val showTorrentDialog: Boolean = false,
    val selectedEpisode: Episode? = null,
    val isStartingStream: Boolean = false,
    val errorMessage: String? = null
)

class DetailsViewModel(
    application: Application,
    private val mediaId: Long,
    private val mediaType: String
) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(DetailsUiState())
    val uiState: StateFlow<DetailsUiState> = _uiState.asStateFlow()

    init {
        loadDetails()
    }

    fun loadDetails() {
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
                tokenProvider = { token }
            )

            val api = networkClient!!.createApiService(serverUrl)

            try {
                val details = if (mediaType == "tv") {
                    api.getTvDetails(mediaId)
                } else {
                    api.getMovieDetails(mediaId)
                }

                _uiState.update { it.copy(isLoading = false, title = details) }

                // If TV series, fetch season 1 episodes
                if (mediaType == "tv") {
                    loadSeason(1)
                }

                // Eagerly prefetch torrents
                searchTorrents(details.name, details.year)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Не удалось загрузить данные: ${e.message}"
                    )
                }
            }
        }
    }

    fun selectSeason(season: Int) {
        _uiState.update { it.copy(selectedSeason = season) }
        loadSeason(season)
    }

    private fun loadSeason(season: Int) {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val seasonRes = api.getSeasonEpisodes(mediaId, season)
                _uiState.update { it.copy(episodes = seasonRes.episodes) }
            } catch (_: Exception) {}
        }
    }

    private fun searchTorrents(titleName: String, year: Int?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSearchingTorrents = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val torrentsRes = api.searchTorrents(
                    query = titleName,
                    tmdbId = mediaId,
                    type = mediaType,
                    year = year
                )
                val list = torrentsRes.torrents.ifEmpty { torrentsRes.results }
                _uiState.update { it.copy(isSearchingTorrents = false, torrents = list) }
            } catch (_: Exception) {
                _uiState.update { it.copy(isSearchingTorrents = false) }
            }
        }
    }

    fun openTorrentDialog(episode: Episode? = null) {
        _uiState.update { it.copy(showTorrentDialog = true, selectedEpisode = episode) }
    }

    fun dismissTorrentDialog() {
        _uiState.update { it.copy(showTorrentDialog = false, selectedEpisode = null) }
    }

    fun playTorrent(
        torrent: TorrentItem,
        onStreamReady: (streamUrl: String, title: String, subtitle: String, isHls: Boolean) -> Unit
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isStartingStream = true, errorMessage = null) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                val streamInfo = api.getTorrentStreamInfo(
                    TorrentStreamRequest(magnet = torrent.magnet, title = torrent.title)
                )

                val file = streamInfo.files.firstOrNull()
                val relativeUrl = file?.streamUrl ?: file?.directUrl ?: file?.hlsUrl
                if (relativeUrl.isNullOrBlank()) {
                    _uiState.update {
                        it.copy(
                            isStartingStream = false,
                            errorMessage = streamInfo.error ?: "В торренте не найдены видеофайлы"
                        )
                    }
                    return@launch
                }

                val fullUrl = if (relativeUrl.startsWith("http")) relativeUrl else "$serverUrl$relativeUrl"
                val ep = _uiState.value.selectedEpisode
                val playTitle = _uiState.value.title?.name ?: torrent.title
                val subTitle = if (ep != null) "Сезон ${ep.season}, Серия ${ep.episode}: ${ep.title.orEmpty()}" else ""

                _uiState.update { it.copy(isStartingStream = false, showTorrentDialog = false) }
                onStreamReady(fullUrl, playTitle, subTitle, relativeUrl.contains(".m3u8"))
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isStartingStream = false,
                        errorMessage = "Ошибка запуска TorrServer: ${e.message}"
                    )
                }
            }
        }
    }

    fun resolveImageUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}

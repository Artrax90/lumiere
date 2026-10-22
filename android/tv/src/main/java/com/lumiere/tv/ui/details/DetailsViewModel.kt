package com.lumiere.tv.ui.details

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.*
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.delay
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
    val similarTitles: List<Title> = emptyList(),
    val isSearchingTorrents: Boolean = false,
    val showTorrentDialog: Boolean = false,
    val selectedEpisode: Episode? = null,
    val activeTorrent: TorrentItem? = null,
    val isStartingStream: Boolean = false,
    val seriesTab: String = "episodes", // "episodes" or "torrents"
    val torrentQualityFilter: String = "all",
    val torrentSortBy: String = "seeds",
    val errorMessage: String? = null,
    val isFavorite: Boolean = false,
    val isInWatchlist: Boolean = false,
    val isSubscribed: Boolean = false,
    val lastWatchedEpisodeNum: Int? = null,
    val savedProgressSec: Long = 0L,
    val lastPlayedTorrentMagnet: String? = null,
    val lastPlayedTorrentTitle: String? = null
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
                tokenProvider = { token },
                preferences = preferences
            )

            val api = networkClient!!.createApiService(serverUrl)

            try {
                val details = if (mediaType == "tv") {
                    api.getTvDetails(mediaId)
                } else {
                    api.getMovieDetails(mediaId)
                }

                _uiState.update { it.copy(isLoading = false, title = details) }

                // Load saved playback progress
                val localProgress = preferences.getPlaybackPosition(mediaId, mediaType) ?: 0L
                var finalProgress = localProgress
                try {
                    val serverProgress = api.getWatchProgress(mediaId, mediaType).progress
                    if (serverProgress > finalProgress) {
                        finalProgress = serverProgress
                        preferences.setPlaybackPosition(mediaId, mediaType, serverProgress)
                    }
                } catch (_: Exception) {}

                // If TV series, fetch saved or season 1 episodes
                var savedSeason = 1
                if (mediaType == "tv") {
                    savedSeason = preferences.getLastWatchedSeriesSeason(mediaId) ?: 1
                    val savedEp = preferences.getLastWatchedSeriesEpisode(mediaId)
                    if (savedEp != null) {
                        val epPos = preferences.getEpisodePlaybackPosition(mediaId, savedSeason, savedEp)
                        if (epPos != null) {
                            finalProgress = epPos
                        }
                    }
                    _uiState.update { it.copy(selectedSeason = savedSeason, lastWatchedEpisodeNum = savedEp) }
                    loadSeason(savedSeason)
                }

                val lastTorrent = preferences.getLastPlayedTorrent(mediaId, if (mediaType == "tv") savedSeason else 0)
                _uiState.update {
                    it.copy(
                        savedProgressSec = finalProgress,
                        lastPlayedTorrentMagnet = lastTorrent?.first,
                        lastPlayedTorrentTitle = lastTorrent?.second
                    )
                }

                // Fetch similar/recommendations
                try {
                    val recs = if (mediaType == "tv") {
                        api.getTvRecommendations(mediaId).results
                    } else {
                        api.getMovieRecommendations(mediaId).results
                    }
                    _uiState.update { it.copy(similarTitles = recs) }
                } catch (_: Exception) {}

                val profileId = preferences.activeProfileId.first() ?: 1L

                // Load favorites status
                try {
                    val favs = api.getFavorites(profileId)
                    val isFav = favs.favorites.any { it.tmdbId == mediaId }
                    _uiState.update { it.copy(isFavorite = isFav) }
                } catch (_: Exception) {}

                // Load watchlist status
                try {
                    val wl = api.getWatchlist(profileId)
                    val isWl = wl.watchlist.any { it.tmdbId == mediaId }
                    _uiState.update { it.copy(isInWatchlist = isWl) }
                } catch (_: Exception) {}

                // Load notification subscription status
                try {
                    val sub = api.isSubscribed(mediaId, mediaType, profileId)
                    _uiState.update { it.copy(isSubscribed = sub.isSubscribed) }
                } catch (_: Exception) {}

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
                var torrentsRes = api.searchTorrents(
                    query = titleName,
                    tmdbId = mediaId,
                    type = mediaType,
                    year = year
                )
                var list = torrentsRes.torrents.ifEmpty { torrentsRes.results }

                val orig = _uiState.value.title?.originalTitle
                if (list.isEmpty() && !orig.isNullOrBlank() && orig != titleName) {
                    try {
                        torrentsRes = api.searchTorrents(
                            query = orig,
                            tmdbId = mediaId,
                            type = mediaType,
                            year = year
                        )
                        list = torrentsRes.torrents.ifEmpty { torrentsRes.results }
                    } catch (_: Exception) {}
                }

                _uiState.update { it.copy(isSearchingTorrents = false, torrents = list) }
            } catch (_: Exception) {
                _uiState.update { it.copy(isSearchingTorrents = false) }
            }
        }
    }

    fun reloadProgress() {
        viewModelScope.launch {
            val localProgress = preferences.getPlaybackPosition(mediaId, mediaType) ?: 0L
            var finalProgress = localProgress
            val serverUrl = preferences.serverUrl.first().orEmpty()
            if (serverUrl.isNotBlank() && networkClient != null) {
                try {
                    val api = networkClient!!.createApiService(serverUrl)
                    val serverProgress = api.getWatchProgress(mediaId, mediaType).progress
                    if (serverProgress > finalProgress) {
                        finalProgress = serverProgress
                        preferences.setPlaybackPosition(mediaId, mediaType, serverProgress)
                    }
                } catch (_: Exception) {}
            }
            val season = if (mediaType == "tv") _uiState.value.selectedSeason else 0
            val savedEp = if (mediaType == "tv") _uiState.value.lastWatchedEpisodeNum else null
            if (mediaType == "tv" && savedEp != null) {
                val epPos = preferences.getEpisodePlaybackPosition(mediaId, season, savedEp)
                if (epPos != null) {
                    finalProgress = epPos
                }
            }
            val lastTorrent = preferences.getLastPlayedTorrent(mediaId, season)
            _uiState.update {
                it.copy(
                    savedProgressSec = finalProgress,
                    lastPlayedTorrentMagnet = lastTorrent?.first,
                    lastPlayedTorrentTitle = lastTorrent?.second
                )
            }
        }
    }

    fun playResumeOrOpenDialog(
        onStreamReady: (streamUrl: String, title: String, subtitle: String, isHls: Boolean) -> Unit
    ) {
        viewModelScope.launch {
            val season = if (mediaType == "tv") _uiState.value.selectedSeason else 0
            val savedTorrent = preferences.getLastPlayedTorrent(mediaId, season)
                ?: preferences.getLastPlayedTorrent(mediaId, 0)
            val currentProgress = _uiState.value.savedProgressSec.takeIf { it > 0L }
                ?: preferences.getPlaybackPosition(mediaId, mediaType) ?: 0L

            if (currentProgress > 0L && savedTorrent != null && savedTorrent.first.isNotBlank()) {
                val matchingTorrent = _uiState.value.torrents.find { it.magnet == savedTorrent.first }
                    ?: TorrentItem(
                        title = savedTorrent.second.ifBlank { _uiState.value.title?.name ?: "Видео" },
                        magnet = savedTorrent.first
                    )

                if (mediaType == "tv") {
                    val targetEpNum = _uiState.value.lastWatchedEpisodeNum
                        ?: preferences.getLastWatchedSeriesEpisode(mediaId)
                        ?: 1
                    val targetEp = _uiState.value.episodes.find { it.episode == targetEpNum }
                        ?: Episode(
                            season = _uiState.value.selectedSeason,
                            episode = targetEpNum,
                            title = "Серия $targetEpNum"
                        )
                    _uiState.update { it.copy(selectedEpisode = targetEp) }
                }

                playTorrent(matchingTorrent, onStreamReady)
            } else {
                openTorrentDialog()
            }
        }
    }

    fun openTorrentDialog(episode: Episode? = null) {
        _uiState.update { it.copy(showTorrentDialog = true, selectedEpisode = episode) }
    }

    fun dismissTorrentDialog() {
        _uiState.update { it.copy(showTorrentDialog = false, selectedEpisode = null) }
    }

    fun dismissStartingStream() {
        _uiState.update { it.copy(isStartingStream = false, activeTorrent = null) }
    }

    fun setSeriesTab(tab: String) {
        _uiState.update { it.copy(seriesTab = tab) }
    }

    fun setTorrentQualityFilter(filter: String) {
        _uiState.update { it.copy(torrentQualityFilter = filter) }
    }

    fun setTorrentSortBy(sort: String) {
        _uiState.update { it.copy(torrentSortBy = sort) }
    }

    fun playTorrent(
        torrent: TorrentItem,
        onStreamReady: (streamUrl: String, title: String, subtitle: String, isHls: Boolean) -> Unit
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isStartingStream = true, activeTorrent = torrent, errorMessage = null) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch

            try {
                var streamInfo = api.getTorrentStreamInfo(
                    TorrentStreamRequest(magnet = torrent.magnet, title = torrent.title)
                )

                // If TorrServer is still resolving metadata, wait 1.5s and retry once
                if (streamInfo.files.isEmpty()) {
                    kotlinx.coroutines.delay(1500)
                    try {
                        streamInfo = api.getTorrentStreamInfo(
                            TorrentStreamRequest(magnet = torrent.magnet, title = torrent.title)
                        )
                    } catch (_: Exception) {}
                }

                val ep = _uiState.value.selectedEpisode
                val file = if (ep != null && streamInfo.files.size > 1) {
                    val epPadded = String.format("%02d", ep.episode)
                    streamInfo.files.find { f ->
                        val extracted = com.lumiere.tv.ui.components.TorrentMetaParser.extractEpisodeNumber(f.name)
                        extracted == ep.episode
                    } ?: streamInfo.files.find { f ->
                        val name = f.name.lowercase()
                        name.contains("e${ep.episode}") || name.contains("e$epPadded") || name.contains(" $epPadded ") || name.contains(" $epPadded.")
                    } ?: streamInfo.files.firstOrNull()
                } else {
                    streamInfo.files.firstOrNull()
                }

                // Prefer direct TorrServer stream (MP4/MKV) which ExoPlayer hardware decodes cleanly with byte-range requests
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
                val playTitle = _uiState.value.title?.name ?: torrent.title
                val subTitle = if (ep != null) "Сезон ${ep.season}, Серия ${ep.episode}: ${ep.title.orEmpty()}" else ""

                if (ep != null) {
                    preferences.setLastWatchedSeries(mediaId, ep.season, ep.episode)
                    _uiState.update { it.copy(selectedSeason = ep.season, lastWatchedEpisodeNum = ep.episode) }
                }

                val curSeason = ep?.season ?: if (mediaType == "tv") _uiState.value.selectedSeason else 0
                preferences.setLastPlayedTorrent(mediaId, curSeason, torrent.magnet, torrent.title)

                _uiState.update {
                    it.copy(
                        isStartingStream = false,
                        showTorrentDialog = false,
                        lastPlayedTorrentMagnet = torrent.magnet,
                        lastPlayedTorrentTitle = torrent.title
                    )
                }
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

    fun playEpisodeDirectly(
        episode: Episode,
        onStreamReady: (streamUrl: String, title: String, subtitle: String, isHls: Boolean) -> Unit
    ) {
        viewModelScope.launch {
            val initialCandidate = _uiState.value.torrents.find { t ->
                com.lumiere.tv.ui.components.TorrentMetaParser.matchesTorrentSeason(t.title, episode.season)
            } ?: _uiState.value.torrents.firstOrNull()

            _uiState.update {
                it.copy(
                    isStartingStream = true,
                    errorMessage = null,
                    selectedEpisode = episode,
                    activeTorrent = initialCandidate
                )
            }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: run {
                _uiState.update { it.copy(isStartingStream = false) }
                return@launch
            }

            try {
                // 1. Ensure torrents list
                var torrents = _uiState.value.torrents
                if (torrents.isEmpty()) {
                    val titleName = _uiState.value.title?.name.orEmpty()
                    val year = _uiState.value.title?.year
                    val res = api.searchTorrents(query = titleName, tmdbId = mediaId, type = mediaType, year = year)
                    torrents = res.torrents.ifEmpty { res.results }
                    _uiState.update { it.copy(torrents = torrents) }
                }

                if (torrents.isEmpty()) {
                    _uiState.update { it.copy(isStartingStream = false, showTorrentDialog = true) }
                    return@launch
                }

                // 2. Filter & sort candidates matching this season, prioritized by highest seeders
                val seasonCandidates = torrents
                    .filter { com.lumiere.tv.ui.components.TorrentMetaParser.matchesTorrentSeason(it.title, episode.season) }
                    .sortedWith(
                        compareByDescending<TorrentItem> {
                            if (com.lumiere.tv.ui.components.TorrentMetaParser.checkTorrentEpisode(it.title, episode.season, episode.episode)) 100 else 0
                        }.thenByDescending { it.seeders ?: 0 }
                    )

                val listToProbe = seasonCandidates.ifEmpty { torrents.sortedByDescending { it.seeders ?: 0 } }
                _uiState.update { it.copy(activeTorrent = listToProbe.firstOrNull()) }

                var foundStreamUrl: String? = null
                var matchedTorrent: TorrentItem? = null
                val epPadded = String.format("%02d", episode.episode)
                val videoExtensions = listOf(".mkv", ".mp4", ".avi", ".ts", ".m4v", ".webm")

                // 3. Probe top candidates with highest seeders, waiting for TorrServer to resolve metadata
                for (cand in listToProbe.take(3)) {
                    _uiState.update { it.copy(activeTorrent = cand) }
                    try {
                        var streamInfo = api.getTorrentStreamInfo(TorrentStreamRequest(magnet = cand.magnet, title = cand.title))
                        
                        // Wait up to 6 seconds for TorrServer to download torrent info dictionary if empty
                        var attempts = 0
                        while (streamInfo.files.isEmpty() && attempts < 6) {
                            delay(1000)
                            attempts++
                            streamInfo = api.getTorrentStreamInfo(TorrentStreamRequest(magnet = cand.magnet, title = cand.title))
                        }

                        if (streamInfo.files.isNotEmpty()) {
                            val videoFiles = streamInfo.files.filter { f ->
                                videoExtensions.any { ext -> f.name.lowercase().endsWith(ext) }
                            }.ifEmpty { streamInfo.files }

                            val matchedFile = if (videoFiles.size == 1) {
                                videoFiles[0]
                            } else {
                                // 1. Try exact regex extraction
                                videoFiles.find { f ->
                                    val extracted = com.lumiere.tv.ui.components.TorrentMetaParser.extractEpisodeNumber(f.name)
                                    extracted == episode.episode
                                } ?: // 2. Try substring match (e01, 01., e1)
                                videoFiles.find { f ->
                                    val name = f.name.lowercase().substringAfterLast('/')
                                    name.contains("e${episode.episode}") || name.contains("e$epPadded") || name.contains(" $epPadded ") || name.contains(" $epPadded.") || name.startsWith("$epPadded ") || name.startsWith("$epPadded.")
                                } ?: // 3. Try positional match in sorted episode files
                                if (videoFiles.size >= episode.episode) {
                                    val sortedVideos = videoFiles.sortedWith(compareBy { it.name.lowercase() })
                                    sortedVideos.getOrNull(episode.episode - 1)
                                } else {
                                    videoFiles.firstOrNull()
                                }
                            }

                            if (matchedFile != null) {
                                val rel = matchedFile.streamUrl ?: matchedFile.directUrl ?: matchedFile.hlsUrl
                                if (!rel.isNullOrBlank()) {
                                    foundStreamUrl = rel
                                    matchedTorrent = cand
                                    break
                                }
                            }
                        }
                    } catch (_: Exception) {
                        // Continue probing next candidate
                    }
                }

                if (foundStreamUrl != null && matchedTorrent != null) {
                    val fullUrl = if (foundStreamUrl.startsWith("http")) foundStreamUrl else "$serverUrl$foundStreamUrl"
                    val playTitle = _uiState.value.title?.name ?: matchedTorrent.title
                    val subTitle = "Сезон ${episode.season}, Серия ${episode.episode}: ${episode.title.orEmpty()}"

                    preferences.setLastWatchedSeries(mediaId, episode.season, episode.episode)
                    preferences.setLastPlayedTorrent(mediaId, episode.season, matchedTorrent.magnet, matchedTorrent.title)
                    _uiState.update {
                        it.copy(
                            isStartingStream = false,
                            showTorrentDialog = false,
                            activeTorrent = null,
                            selectedSeason = episode.season,
                            lastWatchedEpisodeNum = episode.episode,
                            lastPlayedTorrentMagnet = matchedTorrent.magnet,
                            lastPlayedTorrentTitle = matchedTorrent.title
                        )
                    }

                    onStreamReady(fullUrl, playTitle, subTitle, foundStreamUrl.contains(".m3u8"))
                } else {
                    // Fallback to opening torrent selection dialog if auto-resolve could not find exact file
                    _uiState.update { it.copy(isStartingStream = false, showTorrentDialog = true, activeTorrent = null) }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isStartingStream = false,
                        showTorrentDialog = true,
                        activeTorrent = null,
                        errorMessage = "Автозапуск: ${e.message}"
                    )
                }
            }
        }
    }

    fun toggleFavorite() {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch
            val cur = _uiState.value.isFavorite
            val title = _uiState.value.title
            val profileId = preferences.activeProfileId.first() ?: 1L
            try {
                if (cur) {
                    api.removeFavorite(mediaId, profileId)
                    _uiState.update { it.copy(isFavorite = false) }
                } else {
                    api.addFavorite(
                        FavoriteRequest(
                            tmdbId = mediaId,
                            mediaType = mediaType,
                            titleName = title?.name,
                            poster = title?.poster,
                            userId = profileId
                        )
                    )
                    _uiState.update { it.copy(isFavorite = true) }
                }
            } catch (e: Exception) {
                android.util.Log.e("DetailsVM", "Error toggleFavorite", e)
            }
        }
    }

    fun toggleWatchlist() {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch
            val cur = _uiState.value.isInWatchlist
            val title = _uiState.value.title
            val profileId = preferences.activeProfileId.first() ?: 1L
            try {
                if (cur) {
                    api.removeWatchlist(mediaId, profileId)
                    _uiState.update { it.copy(isInWatchlist = false) }
                } else {
                    api.addWatchlist(
                        WatchlistRequest(
                            tmdbId = mediaId,
                            mediaType = mediaType,
                            titleName = title?.name,
                            poster = title?.poster,
                            year = title?.year?.toString(),
                            score = title?.score,
                            userId = profileId
                        )
                    )
                    _uiState.update { it.copy(isInWatchlist = true) }
                }
            } catch (e: Exception) {
                android.util.Log.e("DetailsVM", "Error toggleWatchlist", e)
            }
        }
    }

    fun toggleNotificationSubscription() {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch
            val cur = _uiState.value.isSubscribed
            val title = _uiState.value.title
            val profileId = preferences.activeProfileId.first() ?: 1L
            try {
                if (cur) {
                    api.unsubscribeNotification(mediaId, mediaType)
                    _uiState.update { it.copy(isSubscribed = false) }
                } else {
                    api.subscribeNotification(
                        SubscribeRequest(
                            tmdbId = mediaId,
                            mediaType = mediaType,
                            title = title?.name,
                            poster = title?.poster,
                            year = title?.year,
                            lastSeason = title?.seasonsCount ?: 0,
                            userId = profileId
                        )
                    )
                    _uiState.update { it.copy(isSubscribed = true) }
                }
            } catch (e: Exception) {
                android.util.Log.e("DetailsVM", "Error toggleNotificationSubscription", e)
            }
        }
    }

    fun playTrailer(onTrailerReady: (streamUrl: String) -> Unit) {
        viewModelScope.launch {
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: return@launch
            val targetType = if (mediaType == "tv") "tv" else "movies"
            try {
                val trailerRes = api.getTrailer(targetType, mediaId)
                val stream = trailerRes.trailer?.streamUrl ?: trailerRes.trailer?.embedUrl ?: trailerRes.trailer?.url
                if (!stream.isNullOrBlank()) {
                    val fullUrl = if (stream.startsWith("http")) stream else "$serverUrl$stream"
                    onTrailerReady(fullUrl)
                }
            } catch (_: Exception) {}
        }
    }

    fun resolveImageUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}


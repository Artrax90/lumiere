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
    val isLoadingEpisodes: Boolean = false,
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
    val lastWatchedSeason: Int? = null,
    val lastWatchedEpisodeNum: Int? = null,
    val savedProgressSec: Long = 0L,
    val lastPlayedTorrentMagnet: String? = null,
    val lastPlayedTorrentTitle: String? = null
)

class DetailsViewModel(
    application: Application,
    private val mediaId: Long,
    private val mediaType: String,
    private val source: String? = null
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
                val details = if (source == "kp") {
                    api.getKpDetails(mediaId)
                } else if (mediaType == "tv") {
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
                    _uiState.update {
                        it.copy(
                            selectedSeason = savedSeason,
                            lastWatchedSeason = savedSeason,
                            lastWatchedEpisodeNum = savedEp
                        )
                    }
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
        if (_uiState.value.selectedSeason == season && _uiState.value.episodes.isNotEmpty()) return
        _uiState.update { it.copy(selectedSeason = season, episodes = emptyList(), isLoadingEpisodes = true) }
        loadSeason(season)
    }

    private fun loadSeason(season: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEpisodes = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: run {
                _uiState.update { it.copy(isLoadingEpisodes = false) }
                return@launch
            }

            try {
                android.util.Log.d("LumiereDetails", "Loading season $season for mediaId $mediaId (source=$source)")
                val seasonRes = if (source == "kp") {
                    api.getKpSeasonEpisodes(mediaId, season)
                } else {
                    api.getSeasonEpisodes(mediaId, season)
                }
                if (seasonRes.episodes.isNotEmpty()) {
                    android.util.Log.d("LumiereDetails", "Season $season fetched from API: ${seasonRes.episodes.size} episodes")
                    _uiState.update { it.copy(episodes = seasonRes.episodes, isLoadingEpisodes = false) }
                } else {
                    android.util.Log.d("LumiereDetails", "Season $season API returned 0 episodes, synthesizing from torrents...")
                    synthesizeEpisodesForSeason(season)
                }
            } catch (e: Exception) {
                android.util.Log.w("LumiereDetails", "Season $season API error: ${e.message}, synthesizing from torrents...")
                synthesizeEpisodesForSeason(season)
            }
        }
    }

    private fun synthesizeEpisodesForSeason(season: Int) {
        val showYr = _uiState.value.title?.year
        val matchingTorrents = _uiState.value.torrents.filter {
            com.lumiere.tv.ui.components.TorrentMetaParser.matchesTorrentSeason(it.title, season, showYr)
        }
        var maxEp = 1
        val epRangeRegex = Regex("""(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*(?:выпуск|сери)""", RegexOption.IGNORE_CASE)
        val singleEpRegex = Regex("""(?:выпуск|сери[яий]|ep|episode)\s*[:.]?\s*(\d{1,3})""", RegexOption.IGNORE_CASE)
        val sxRangeRegex = Regex("""\b\d{1,2}[xх](\d{1,3})\s*[-–—]\s*(\d{1,3})\b""", RegexOption.IGNORE_CASE)
        val sxSingleRegex = Regex("""\b\d{1,2}[xх](\d{1,3})\b""", RegexOption.IGNORE_CASE)
        val seRangeRegex = Regex("""\b[sS]\d{1,2}[eE](\d{1,3})\s*[-–—]\s*[eE]?(\d{1,3})\b""", RegexOption.IGNORE_CASE)
        val seSingleRegex = Regex("""\b[sS]\d{1,2}[eE](\d{1,3})\b""", RegexOption.IGNORE_CASE)

        for (t in matchingTorrents) {
            epRangeRegex.find(t.title)?.let { m ->
                val end = m.groupValues.getOrNull(2)?.toIntOrNull() ?: 1
                if (end in 1..200) maxEp = maxOf(maxEp, end)
            }
            sxRangeRegex.find(t.title)?.let { m ->
                val end = m.groupValues.getOrNull(2)?.toIntOrNull() ?: 1
                if (end in 1..200) maxEp = maxOf(maxEp, end)
            }
            seRangeRegex.find(t.title)?.let { m ->
                val end = m.groupValues.getOrNull(2)?.toIntOrNull() ?: 1
                if (end in 1..200) maxEp = maxOf(maxEp, end)
            }
            singleEpRegex.find(t.title)?.let { m ->
                val ep = m.groupValues.getOrNull(1)?.toIntOrNull() ?: 1
                if (ep in 1..200) maxEp = maxOf(maxEp, ep)
            }
            sxSingleRegex.find(t.title)?.let { m ->
                val ep = m.groupValues.getOrNull(1)?.toIntOrNull() ?: 1
                if (ep in 1..200) maxEp = maxOf(maxEp, ep)
            }
            seSingleRegex.find(t.title)?.let { m ->
                val ep = m.groupValues.getOrNull(1)?.toIntOrNull() ?: 1
                if (ep in 1..200) maxEp = maxOf(maxEp, ep)
            }
        }
        val count = if (maxEp > 1) maxEp else 8
        val posterFallback = _uiState.value.title?.backdrop.orEmpty().ifBlank { _uiState.value.title?.poster.orEmpty() }
        val isShow = matchingTorrents.any { it.title.contains("выпуск", ignoreCase = true) } ||
                     _uiState.value.title?.genres?.any { it.contains("ток-шоу", ignoreCase = true) || it.contains("шоу", ignoreCase = true) } == true
        val epLabel = if (isShow) "Выпуск" else "Серия"
        val synth = (1..count).map { epNum ->
            Episode(
                id = "tv-$mediaId-s${season}e$epNum",
                seriesId = mediaId,
                season = season,
                episode = epNum,
                title = "Сезон $season · $epLabel $epNum",
                synopsis = null,
                runtime = null,
                thumbnail = posterFallback,
                aired = null,
                isAired = true,
                progress = null
            )
        }
        _uiState.update { it.copy(episodes = synth, isLoadingEpisodes = false) }
    }

    private fun searchTorrents(titleName: String, year: Int?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSearchingTorrents = true) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val api = networkClient?.createApiService(serverUrl) ?: run {
                _uiState.update { it.copy(isSearchingTorrents = false) }
                return@launch
            }

            try {
                android.util.Log.d("LumiereDetails", "Searching torrents for $titleName (mediaId=$mediaId, source=$source, year=$year)")
                var torrentsRes = api.searchTorrents(
                    query = titleName,
                    tmdbId = if (source == "kp") null else mediaId,
                    type = mediaType,
                    year = year
                )
                var list = torrentsRes.torrents.ifEmpty { torrentsRes.results }

                // Fallback 1: If searching with tmdbId yielded 0 results, retry without tmdbId
                if (list.isEmpty() && source != "kp") {
                    try {
                        torrentsRes = api.searchTorrents(
                            query = titleName,
                            tmdbId = null,
                            type = mediaType,
                            year = year
                        )
                        list = torrentsRes.torrents.ifEmpty { torrentsRes.results }
                    } catch (e: Exception) {
                        android.util.Log.w("LumiereDetails", "Fallback search without tmdbId failed: ${e.message}")
                    }
                }

                // Fallback 2: Retry with original title if different
                val orig = _uiState.value.title?.originalTitle
                if (list.isEmpty() && !orig.isNullOrBlank() && orig != titleName) {
                    try {
                        torrentsRes = api.searchTorrents(
                            query = orig,
                            tmdbId = null,
                            type = mediaType,
                            year = year
                        )
                        list = torrentsRes.torrents.ifEmpty { torrentsRes.results }
                    } catch (e: Exception) {
                        android.util.Log.w("LumiereDetails", "Fallback search with originalTitle failed: ${e.message}")
                    }
                }

                android.util.Log.d("LumiereDetails", "Torrents search finished: found ${list.size} torrents for $titleName")

                // Detect true seasons count across all torrents
                if (mediaType == "tv") {
                    val detectedMaxSeason = com.lumiere.tv.ui.components.TorrentMetaParser.detectMaxSeason(list, year)
                    val currentCount = _uiState.value.title?.seasonsCount ?: 1
                    if (detectedMaxSeason > currentCount) {
                        android.util.Log.d("LumiereDetails", "Updating seasonsCount from $currentCount to $detectedMaxSeason for $titleName")
                        _uiState.update { it.copy(title = it.title?.copy(seasonsCount = detectedMaxSeason)) }
                    }
                }

                _uiState.update { it.copy(isSearchingTorrents = false, torrents = list) }

                // If currently viewed season has no episodes or has synthetic episodes, update them now with torrents info
                if (mediaType == "tv") {
                    val currentEps = _uiState.value.episodes
                    val isSynthetic = currentEps.isEmpty() || currentEps.all { it.synopsis == null && it.runtime == null }
                    if (isSynthetic) {
                        synthesizeEpisodesForSeason(_uiState.value.selectedSeason)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("LumiereDetails", "Torrents search error: ${e.message}", e)
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
        if (_uiState.value.torrents.isEmpty() && !_uiState.value.isSearchingTorrents) {
            val t = _uiState.value.title
            if (t != null) {
                searchTorrents(t.name, t.year)
            }
        }
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


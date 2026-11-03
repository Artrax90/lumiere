package com.lumiere.core.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.catch
import java.io.IOException

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(
    name = "lumiere_prefs",
    corruptionHandler = ReplaceFileCorruptionHandler {
        android.util.Log.e("AppPreferences", "Preferences proto corrupted! Replacing with empty preferences.", it)
        emptyPreferences()
    }
)

class AppPreferences(private val context: Context) {

    companion object {
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val KEY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        private val KEY_PROFILE_ID = longPreferencesKey("profile_id")
        private val KEY_PROFILE_NAME = stringPreferencesKey("profile_name")
        private val KEY_PROFILE_AVATAR = stringPreferencesKey("profile_avatar")
        private val KEY_IS_KIDS = booleanPreferencesKey("is_kids")
        private val KEY_LAST_WATCHED_TMDB_ID = longPreferencesKey("last_watched_tmdb_id")
        private val KEY_LAST_WATCHED_MEDIA_TYPE = stringPreferencesKey("last_watched_media_type")
        private val KEY_LAST_WATCHED_POSITION = longPreferencesKey("last_watched_position")
        private val KEY_SEARCH_HISTORY = stringPreferencesKey("search_history_json")
        private val KEY_PREFERRED_VOICEOVER = stringPreferencesKey("preferred_voiceover")
        private val KEY_HOME_SHELVES = stringPreferencesKey("home_shelves_json")
    }

    private val safeData: Flow<Preferences> = context.dataStore.data.catch { exception ->
        if (exception is IOException) {
            android.util.Log.e("AppPreferences", "Error reading preferences: ${exception.message}", exception)
            emit(emptyPreferences())
        } else {
            throw exception
        }
    }

    val searchHistory: Flow<List<String>> = safeData.map { prefs ->
        val json = prefs[KEY_SEARCH_HISTORY]
        if (!json.isNullOrBlank()) {
            try {
                val array = org.json.JSONArray(json)
                (0 until array.length()).map { array.getString(it) }
            } catch (_: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }
    }

    val serverUrl: Flow<String?> = safeData.map { prefs ->
        prefs[KEY_SERVER_URL]
    }

    val accessToken: Flow<String?> = safeData.map { prefs ->
        prefs[KEY_ACCESS_TOKEN]
    }

    val refreshToken: Flow<String?> = safeData.map { prefs ->
        prefs[KEY_REFRESH_TOKEN]
    }

    val activeProfileId: Flow<Long?> = safeData.map { prefs ->
        prefs[KEY_PROFILE_ID]
    }

    val activeProfileName: Flow<String?> = safeData.map { prefs ->
        prefs[KEY_PROFILE_NAME]
    }

    val activeProfileAvatar: Flow<String?> = safeData.map { prefs ->
        prefs[KEY_PROFILE_AVATAR]
    }

    val isKids: Flow<Boolean> = safeData.map { prefs ->
        prefs[KEY_IS_KIDS] ?: false
    }

    val lastWatchedTmdbId: Flow<Long?> = safeData.map { prefs ->
        prefs[KEY_LAST_WATCHED_TMDB_ID]
    }

    suspend fun getServerUrlSync(): String? {
        return safeData.first()[KEY_SERVER_URL]
    }

    suspend fun getAccessTokenSync(): String? {
        return safeData.first()[KEY_ACCESS_TOKEN]
    }

    suspend fun setServerUrl(url: String) {
        val sanitized = url.trim().trimEnd('/')
        context.dataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = sanitized
        }
    }

    suspend fun clearServerUrl() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_SERVER_URL)
            prefs.remove(KEY_ACCESS_TOKEN)
            prefs.remove(KEY_REFRESH_TOKEN)
            prefs.remove(KEY_PROFILE_ID)
            prefs.remove(KEY_PROFILE_NAME)
            prefs.remove(KEY_PROFILE_AVATAR)
        }
    }

    suspend fun setTokens(access: String, refresh: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_ACCESS_TOKEN] = access
            prefs[KEY_REFRESH_TOKEN] = refresh
        }
    }

    suspend fun clearTokens() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_ACCESS_TOKEN)
            prefs.remove(KEY_REFRESH_TOKEN)
        }
    }

    suspend fun setActiveProfile(id: Long, name: String, avatar: String?, isKids: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[KEY_PROFILE_ID] = id
            prefs[KEY_PROFILE_NAME] = name
            if (avatar != null) {
                prefs[KEY_PROFILE_AVATAR] = avatar
            } else {
                prefs.remove(KEY_PROFILE_AVATAR)
            }
            prefs[KEY_IS_KIDS] = isKids
        }
    }

    suspend fun clearActiveProfile() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_PROFILE_ID)
            prefs.remove(KEY_PROFILE_NAME)
            prefs.remove(KEY_PROFILE_AVATAR)
            prefs.remove(KEY_IS_KIDS)
        }
    }

    suspend fun setLastWatched(tmdbId: Long, mediaType: String, positionSec: Long) {
        context.dataStore.edit { prefs ->
            prefs[KEY_LAST_WATCHED_TMDB_ID] = tmdbId
            prefs[KEY_LAST_WATCHED_MEDIA_TYPE] = mediaType
            prefs[KEY_LAST_WATCHED_POSITION] = positionSec
            prefs[longPreferencesKey("pos_${mediaType}_$tmdbId")] = positionSec
        }
    }

    suspend fun setPlaybackPosition(tmdbId: Long, mediaType: String, positionSec: Long) {
        context.dataStore.edit { prefs ->
            prefs[longPreferencesKey("pos_${mediaType}_$tmdbId")] = positionSec
            prefs[KEY_LAST_WATCHED_TMDB_ID] = tmdbId
            prefs[KEY_LAST_WATCHED_MEDIA_TYPE] = mediaType
            prefs[KEY_LAST_WATCHED_POSITION] = positionSec
        }
    }

    suspend fun getPlaybackPosition(tmdbId: Long, mediaType: String): Long? {
        return context.dataStore.data.first()[longPreferencesKey("pos_${mediaType}_$tmdbId")]
    }

    suspend fun setEpisodePlaybackPosition(tmdbId: Long, season: Int, episode: Int, positionSec: Long, durationSec: Long = 0L) {
        context.dataStore.edit { prefs ->
            prefs[longPreferencesKey("pos_tv_${tmdbId}_s${season}_e${episode}")] = positionSec
            if (durationSec > 0L) {
                prefs[longPreferencesKey("dur_tv_${tmdbId}_s${season}_e${episode}")] = durationSec
            }
        }
    }

    suspend fun getEpisodePlaybackPosition(tmdbId: Long, season: Int, episode: Int): Long? {
        return context.dataStore.data.first()[longPreferencesKey("pos_tv_${tmdbId}_s${season}_e${episode}")]
    }

    suspend fun getEpisodePlaybackDuration(tmdbId: Long, season: Int, episode: Int): Long? {
        return context.dataStore.data.first()[longPreferencesKey("dur_tv_${tmdbId}_s${season}_e${episode}")]
    }

    suspend fun getWatchedEpisodes(mediaId: Long): Set<String> {
        val raw = context.dataStore.data.first()[stringSetPreferencesKey("watched_episodes_$mediaId")]
        return raw ?: emptySet()
    }

    suspend fun setEpisodeWatched(mediaId: Long, season: Int, episode: Int, watched: Boolean) {
        context.dataStore.edit { prefs ->
            val key = stringSetPreferencesKey("watched_episodes_$mediaId")
            val current = prefs[key]?.toMutableSet() ?: mutableSetOf()
            val tag = "${season}_${episode}"
            if (watched) {
                current.add(tag)
            } else {
                current.remove(tag)
            }
            prefs[key] = current
        }
    }

    suspend fun saveWatchedEpisodes(mediaId: Long, episodes: Set<String>) {
        context.dataStore.edit { prefs ->
            prefs[stringSetPreferencesKey("watched_episodes_$mediaId")] = episodes
        }
    }

    suspend fun setLastWatchedSeries(seriesId: Long, season: Int, episode: Int) {
        context.dataStore.edit { prefs ->
            prefs[intPreferencesKey("last_season_$seriesId")] = season
            prefs[intPreferencesKey("last_episode_$seriesId")] = episode
        }
    }

    suspend fun getLastWatchedSeriesSeason(seriesId: Long): Int? {
        return context.dataStore.data.first()[intPreferencesKey("last_season_$seriesId")]
    }

    suspend fun getLastWatchedSeriesEpisode(seriesId: Long): Int? {
        return context.dataStore.data.first()[intPreferencesKey("last_episode_$seriesId")]
    }

    suspend fun setLastPlayedTorrent(mediaId: Long, season: Int = 0, magnet: String, title: String) {
        context.dataStore.edit { prefs ->
            val keySuffix = if (season > 0) "${mediaId}_s$season" else "$mediaId"
            prefs[stringPreferencesKey("last_torrent_magnet_$keySuffix")] = magnet
            prefs[stringPreferencesKey("last_torrent_title_$keySuffix")] = title
            // Also save default mediaId key as fallback
            prefs[stringPreferencesKey("last_torrent_magnet_$mediaId")] = magnet
            prefs[stringPreferencesKey("last_torrent_title_$mediaId")] = title
        }
    }

    suspend fun getLastPlayedTorrent(mediaId: Long, season: Int = 0): Pair<String, String>? {
        val prefs = context.dataStore.data.first()
        val keySuffix = if (season > 0) "${mediaId}_s$season" else "$mediaId"
        var magnet = prefs[stringPreferencesKey("last_torrent_magnet_$keySuffix")]
        var title = prefs[stringPreferencesKey("last_torrent_title_$keySuffix")]
        if (magnet.isNullOrBlank() && season > 0) {
            magnet = prefs[stringPreferencesKey("last_torrent_magnet_$mediaId")]
            title = prefs[stringPreferencesKey("last_torrent_title_$mediaId")]
        }
        return if (!magnet.isNullOrBlank()) Pair(magnet, title.orEmpty()) else null
    }

    suspend fun addSearchQuery(query: String) {
        val trimmed = query.trim()
        if (trimmed.length < 2) return
        context.dataStore.edit { prefs ->
            val json = prefs[KEY_SEARCH_HISTORY]
            val currentList = if (!json.isNullOrBlank()) {
                try {
                    val array = org.json.JSONArray(json)
                    (0 until array.length()).map { array.getString(it) }.toMutableList()
                } catch (_: Exception) {
                    mutableListOf()
                }
            } else {
                mutableListOf()
            }
            // Remove if already exists (case-insensitive)
            currentList.removeAll { it.equals(trimmed, ignoreCase = true) }
            // Add to head
            currentList.add(0, trimmed)
            // Limit to max 15 items
            val truncated = currentList.take(15)
            val newArray = org.json.JSONArray()
            truncated.forEach { newArray.put(it) }
            prefs[KEY_SEARCH_HISTORY] = newArray.toString()
        }
    }

    suspend fun removeSearchQuery(query: String) {
        val trimmed = query.trim()
        context.dataStore.edit { prefs ->
            val json = prefs[KEY_SEARCH_HISTORY]
            if (!json.isNullOrBlank()) {
                try {
                    val array = org.json.JSONArray(json)
                    val currentList = (0 until array.length()).map { array.getString(it) }.toMutableList()
                    currentList.removeAll { it.equals(trimmed, ignoreCase = true) }
                    val newArray = org.json.JSONArray()
                    currentList.forEach { newArray.put(it) }
                    prefs[KEY_SEARCH_HISTORY] = newArray.toString()
                } catch (_: Exception) {}
            }
        }
    }

    suspend fun clearSearchHistory() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_SEARCH_HISTORY)
        }
    }

    val preferredVoiceover: Flow<String?> = safeData.map { it[KEY_PREFERRED_VOICEOVER] }

    suspend fun getPreferredVoiceover(): String {
        return safeData.first()[KEY_PREFERRED_VOICEOVER].orEmpty()
    }

    suspend fun setPreferredVoiceover(voiceover: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_PREFERRED_VOICEOVER] = voiceover.trim()
        }
    }

    val defaultHomeShelves = listOf(
        com.lumiere.core.model.HomeShelfItem("continueWatching", "Продолжить просмотр", true),
        com.lumiere.core.model.HomeShelfItem("recommendations", "Вам может понравиться", true),
        com.lumiere.core.model.HomeShelfItem("trendingMovies", "В тренде (Фильмы)", true),
        com.lumiere.core.model.HomeShelfItem("netflixMovies", "Топ фильмы Netflix", true),
        com.lumiere.core.model.HomeShelfItem("popularMovies", "Популярные фильмы", true),
        com.lumiere.core.model.HomeShelfItem("trendingTv", "В тренде (Сериалы)", true),
        com.lumiere.core.model.HomeShelfItem("netflixTv", "Топ сериалы Netflix", true),
        com.lumiere.core.model.HomeShelfItem("popularTv", "Популярные сериалы", true)
    )

    fun getHomeShelvesFlow(): Flow<List<com.lumiere.core.model.HomeShelfItem>> = safeData.map { prefs ->
        val json = prefs[KEY_HOME_SHELVES]
        if (!json.isNullOrBlank()) {
            try {
                val array = org.json.JSONArray(json)
                val list = mutableListOf<com.lumiere.core.model.HomeShelfItem>()
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    list.add(
                        com.lumiere.core.model.HomeShelfItem(
                            id = obj.getString("id"),
                            label = obj.optString("label", ""),
                            enabled = obj.optBoolean("enabled", true)
                        )
                    )
                }
                val existingIds = list.map { it.id }.toSet()
                val merged = list.toMutableList()
                for (def in defaultHomeShelves) {
                    if (!existingIds.contains(def.id)) {
                        merged.add(def)
                    }
                }
                merged
            } catch (_: Exception) {
                defaultHomeShelves
            }
        } else {
            defaultHomeShelves
        }
    }

    suspend fun getHomeShelves(): List<com.lumiere.core.model.HomeShelfItem> {
        return getHomeShelvesFlow().first()
    }

    suspend fun saveHomeShelves(shelves: List<com.lumiere.core.model.HomeShelfItem>) {
        context.dataStore.edit { prefs ->
            val array = org.json.JSONArray()
            shelves.forEach { shelf ->
                val obj = org.json.JSONObject()
                obj.put("id", shelf.id)
                obj.put("label", shelf.label)
                obj.put("enabled", shelf.enabled)
                array.put(obj)
            }
            prefs[KEY_HOME_SHELVES] = array.toString()
        }
    }
}


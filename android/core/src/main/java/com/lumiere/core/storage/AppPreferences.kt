package com.lumiere.core.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "lumiere_prefs")

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
    }

    val searchHistory: Flow<List<String>> = context.dataStore.data.map { prefs ->
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

    val serverUrl: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_SERVER_URL]
    }

    val accessToken: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_ACCESS_TOKEN]
    }

    val refreshToken: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_REFRESH_TOKEN]
    }

    val activeProfileId: Flow<Long?> = context.dataStore.data.map { prefs ->
        prefs[KEY_PROFILE_ID]
    }

    val activeProfileName: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_PROFILE_NAME]
    }

    val activeProfileAvatar: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_PROFILE_AVATAR]
    }

    val isKids: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_IS_KIDS] ?: false
    }

    val lastWatchedTmdbId: Flow<Long?> = context.dataStore.data.map { prefs ->
        prefs[KEY_LAST_WATCHED_TMDB_ID]
    }

    suspend fun getServerUrlSync(): String? {
        return context.dataStore.data.first()[KEY_SERVER_URL]
    }

    suspend fun getAccessTokenSync(): String? {
        return context.dataStore.data.first()[KEY_ACCESS_TOKEN]
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

    suspend fun setEpisodePlaybackPosition(tmdbId: Long, season: Int, episode: Int, positionSec: Long) {
        context.dataStore.edit { prefs ->
            prefs[longPreferencesKey("pos_tv_${tmdbId}_s${season}_e${episode}")] = positionSec
        }
    }

    suspend fun getEpisodePlaybackPosition(tmdbId: Long, season: Int, episode: Int): Long? {
        return context.dataStore.data.first()[longPreferencesKey("pos_tv_${tmdbId}_s${season}_e${episode}")]
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
}


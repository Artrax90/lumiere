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
        }
    }
}

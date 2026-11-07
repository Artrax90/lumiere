package com.lumiere.tv.data

import android.content.Context
import coil3.imageLoader
import coil3.request.ImageRequest
import com.lumiere.core.model.Title
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

object DetailsPreloadCache {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val cache = ConcurrentHashMap<String, Title>()
    private var activeJob: Job? = null
    private var currentKey: String? = null

    fun makeKey(mediaId: Long, mediaType: String?, source: String?): String {
        val s = source ?: "default"
        val t = mediaType ?: "movie"
        return "${s}_${t}_$mediaId"
    }

    fun get(mediaId: Long, mediaType: String?, source: String?): Title? {
        val key = makeKey(mediaId, mediaType, source)
        return cache[key]
    }

    fun put(mediaId: Long, mediaType: String?, source: String?, title: Title) {
        val key = makeKey(mediaId, mediaType, source)
        if (cache.size > 25) {
            val iterator = cache.keys().iterator()
            if (iterator.hasNext()) {
                cache.remove(iterator.next())
            }
        }
        cache[key] = title
    }

    fun preload(context: Context, mediaId: Long, mediaType: String?, source: String? = null) {
        if (mediaId <= 0L) return
        val key = makeKey(mediaId, mediaType, source)
        if (cache.containsKey(key)) return

        if (currentKey == key && activeJob?.isActive == true) return

        activeJob?.cancel()
        currentKey = key

        val appContext = context.applicationContext
        activeJob = scope.launch {
            try {
                val preferences = AppPreferences(appContext)
                val serverUrl = preferences.serverUrl.first().orEmpty()
                if (serverUrl.isBlank()) return@launch

                AppPreferences.cachedServerUrl = serverUrl
                val token = preferences.accessToken.first()
                if (!token.isNullOrBlank()) {
                    AppPreferences.cachedAccessToken = token
                }
                val client = NetworkClient(
                    baseUrlProvider = { serverUrl },
                    tokenProvider = { token },
                    preferences = preferences
                )
                val api = client.createApiService(serverUrl)

                val details = if (source == "kp") {
                    api.getKpDetails(mediaId)
                } else if (mediaType == "tv") {
                    api.getTvDetails(mediaId)
                } else {
                    api.getMovieDetails(mediaId)
                }

                if (isActive) {
                    put(mediaId, mediaType, source, details)

                    // Prefetch backdrop for instantaneous rendering in DetailsScreen
                    val backdropUrl = client.resolveImageUrl(details.backdrop)
                    if (backdropUrl.isNotBlank()) {
                        val backdropReq = ImageRequest.Builder(appContext)
                            .data(backdropUrl)
                            .size(1280, 720)
                            .build()
                        appContext.imageLoader.enqueue(backdropReq)
                    }
                }
            } catch (_: Exception) {
                // Silently ignore prefetch exceptions
            }
        }
    }
}


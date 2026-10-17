package com.lumiere.core.network

import com.lumiere.core.model.RefreshResponse
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

class NetworkClient(
    private var baseUrlProvider: () -> String,
    private var tokenProvider: () -> String? = { null },
    private val preferences: AppPreferences? = null
) {

    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }

    private val authAndHeaderInterceptor = Interceptor { chain ->
        val original = chain.request()
        val builder = original.newBuilder()
            .header("x-lumiere-tv", "1")
            .header("x-lumiere-client", "tv")

        val token = tokenProvider() ?: preferences?.let { prefs ->
            runBlocking { prefs.accessToken.first() }
        }
        if (!token.isNullOrBlank() && original.header("Authorization") == null) {
            builder.header("Authorization", "Bearer $token")
        }

        chain.proceed(builder.build())
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(authAndHeaderInterceptor)
        .authenticator { _, response ->
            if (responseCount(response) >= 3) return@authenticator null
            val prefs = preferences ?: return@authenticator null
            val refreshToken = runBlocking { prefs.refreshToken.first() }
            if (refreshToken.isNullOrBlank()) return@authenticator null
            val serverUrl = baseUrlProvider()
            if (serverUrl.isBlank()) return@authenticator null

            try {
                val refreshClient = OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(10, TimeUnit.SECONDS)
                    .build()
                val body = """{"refreshToken":"$refreshToken"}""".toRequestBody("application/json".toMediaType())
                val req = okhttp3.Request.Builder()
                    .url("${serverUrl.trimEnd('/')}/api/auth/refresh")
                    .post(body)
                    .build()
                val refreshResp = refreshClient.newCall(req).execute()
                if (refreshResp.isSuccessful) {
                    val respStr = refreshResp.body?.string().orEmpty()
                    val parsed = json.decodeFromString<RefreshResponse>(respStr)
                    runBlocking { prefs.setTokens(parsed.accessToken, parsed.refreshToken) }
                    return@authenticator response.request.newBuilder()
                        .header("Authorization", "Bearer ${parsed.accessToken}")
                        .build()
                }
            } catch (_: Exception) {}
            null
        }
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

    fun createApiService(baseUrl: String = baseUrlProvider()): LumiereApiService {
        val cleanBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val contentType = "application/json".toMediaType()

        return Retrofit.Builder()
            .baseUrl(cleanBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
            .create(LumiereApiService::class.java)
    }

    /**
     * Resolve image URL through Lumiere server proxy if needed (TMDB/external posters bypass ISP blocking)
     */
    fun resolveImageUrl(path: String?, serverBaseUrl: String = baseUrlProvider()): String {
        if (path.isNullOrBlank()) return ""
        val cleanBase = serverBaseUrl.trimEnd('/')

        if (path.contains("/api/image")) {
            return if (path.startsWith("http://") || path.startsWith("https://")) path else "$cleanBase/$path".replace("//", "/").replace(":/", "://")
        }

        if (path.contains("image.tmdb.org") || path.contains("themoviedb.org") ||
            path.contains("kinopoisk") || path.contains("yandex.net")) {
            val encoded = URLEncoder.encode(path, StandardCharsets.UTF_8.toString())
            return "$cleanBase/api/image?url=$encoded"
        }

        if (path.startsWith("/") && !path.startsWith("/api/") && !path.startsWith("/assets") &&
            !path.startsWith("/icon") && !path.startsWith("/favicon")) {
            val tmdbPath = if (path.startsWith("/t/p/")) path else "/t/p/w500$path"
            val fullUrl = "https://image.tmdb.org$tmdbPath"
            val encoded = URLEncoder.encode(fullUrl, StandardCharsets.UTF_8.toString())
            return "$cleanBase/api/image?url=$encoded"
        }

        if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
            return path
        }

        return "$cleanBase/$path".replace("//", "/").replace(":/", "://")
    }
}

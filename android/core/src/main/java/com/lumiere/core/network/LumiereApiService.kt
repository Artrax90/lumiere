package com.lumiere.core.network

import com.lumiere.core.model.*
import retrofit2.http.*

interface LumiereApiService {

    @GET("/api/health")
    suspend fun checkHealth(): HealthResponse

    @GET("/api/setup/status")
    suspend fun getSetupStatus(): SetupStatusResponse

    @GET("/api/auth/lan-status")
    suspend fun getLanStatus(): LanStatusResponse

    @GET("/api/auth/profiles")
    suspend fun getProfiles(): ProfilesResponse

    @POST("/api/auth/quick-login")
    suspend fun quickLogin(@Body request: QuickLoginRequest): AuthResponse

    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @POST("/api/auth/refresh")
    suspend fun refreshToken(@Body request: RefreshRequest): RefreshResponse

    @GET("/api/user/profile")
    suspend fun getUserProfile(): Profile

    @GET("/api/movies/trending")
    suspend fun getTrendingMovies(@Query("lang") lang: String = "ru"): TitleListResponse

    @GET("/api/tv/trending")
    suspend fun getTrendingTv(@Query("lang") lang: String = "ru"): TitleListResponse

    @GET("/api/movies/popular")
    suspend fun getPopularMovies(
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/tv/popular")
    suspend fun getPopularTv(
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/movies/top_rated")
    suspend fun getTopRatedMovies(
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/tv/top_rated")
    suspend fun getTopRatedTv(
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/movies/{id}")
    suspend fun getMovieDetails(
        @Path("id") id: Long,
        @Query("lang") lang: String = "ru"
    ): Title

    @GET("/api/tv/{id}")
    suspend fun getTvDetails(
        @Path("id") id: Long,
        @Query("lang") lang: String = "ru"
    ): Title

    @GET("/api/tv/{id}/season/{season}")
    suspend fun getSeasonEpisodes(
        @Path("id") id: Long,
        @Path("season") season: Int,
        @Query("lang") lang: String = "ru"
    ): SeasonResponse

    @GET("/api/search")
    suspend fun searchTitles(
        @Query("q") query: String,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/torrents/search")
    suspend fun searchTorrents(
        @Query("q") query: String,
        @Query("tmdbId") tmdbId: Long? = null,
        @Query("type") type: String? = null,
        @Query("year") year: Int? = null
    ): TorrentSearchResponse

    @POST("/api/torrents/stream")
    suspend fun getTorrentStreamInfo(
        @Body request: TorrentStreamRequest
    ): TorrentStreamInfoResponse

    @POST("/api/torrents/torrserver/list")
    suspend fun getTorrServerStats(): List<TorrServerTorrentStat>

    @POST("/api/iptv/parse")
    suspend fun parseIptvPlaylist(
        @Body request: IptvParseRequest = IptvParseRequest()
    ): IptvParseResponse

    @POST("/api/iptv/epg")
    suspend fun getEpg(
        @Body request: Map<String, String>
    ): EpgResponse

    @GET("/api/sync/pull")
    suspend fun pullSync(): SyncPullResponse
}

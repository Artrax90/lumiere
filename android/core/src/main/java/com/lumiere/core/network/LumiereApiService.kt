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

    @GET("/api/movies/netflix")
    suspend fun getNetflixMovies(
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru",
        @Query("period") period: String = "week"
    ): TitleListResponse

    @GET("/api/tv/netflix")
    suspend fun getNetflixTv(
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru",
        @Query("period") period: String = "week"
    ): TitleListResponse

    @GET("/api/genres")
    suspend fun getGenres(
        @Query("type") type: String = "movie",
        @Query("lang") lang: String = "ru"
    ): GenreListResponse

    @GET("/api/movies/genre/{genreId}")
    suspend fun getMoviesByGenre(
        @Path("genreId") genreId: Int,
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/tv/genre/{genreId}")
    suspend fun getTvByGenre(
        @Path("genreId") genreId: Int,
        @Query("page") page: Int = 1,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/movies/{id}/recommendations")
    suspend fun getMovieRecommendations(
        @Path("id") id: Long,
        @Query("lang") lang: String = "ru"
    ): TitleListResponse

    @GET("/api/tv/{id}/recommendations")
    suspend fun getTvRecommendations(
        @Path("id") id: Long,
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

    @GET("/api/iptv/default")
    suspend fun getDefaultIptvPlaylist(): IptvParseResponse

    @GET("/api/notifications")
    suspend fun getNotifications(@Query("userId") userId: Long? = null): NotificationsResponse

    @PUT("/api/notifications/read-all")
    suspend fun markAllNotificationsRead(): SimpleActionResponse

    @PUT("/api/notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: Long): SimpleActionResponse

    @POST("/api/iptv/epg")
    suspend fun getEpg(
        @Body request: Map<String, String>
    ): EpgResponse

    @GET("/api/sync/pull")
    suspend fun pullSync(): SyncPullResponse

    @GET("/api/user/favorites")
    suspend fun getFavorites(@Query("userId") userId: Long? = null): FavoritesResponse

    @POST("/api/user/favorites")
    suspend fun addFavorite(@Body request: FavoriteRequest): SimpleActionResponse

    @DELETE("/api/user/favorites/{tmdbId}")
    suspend fun removeFavorite(
        @Path("tmdbId") tmdbId: Long,
        @Query("userId") userId: Long? = null
    ): SimpleActionResponse

    @GET("/api/user/watchlist")
    suspend fun getWatchlist(@Query("userId") userId: Long? = null): WatchlistResponse

    @POST("/api/user/watchlist")
    suspend fun addWatchlist(@Body request: WatchlistRequest): SimpleActionResponse

    @DELETE("/api/user/watchlist/{tmdbId}")
    suspend fun removeWatchlist(
        @Path("tmdbId") tmdbId: Long,
        @Query("userId") userId: Long? = null
    ): SimpleActionResponse

    @GET("/api/notifications/is-subscribed/{tmdbId}")
    suspend fun isSubscribed(
        @Path("tmdbId") tmdbId: Long,
        @Query("mediaType") mediaType: String,
        @Query("userId") userId: Long? = null
    ): SubscriptionStatusResponse

    @POST("/api/notifications/subscribe")
    suspend fun subscribeNotification(@Body request: SubscribeRequest): SimpleActionResponse

    @DELETE("/api/notifications/subscribe/{tmdbId}")
    suspend fun unsubscribeNotification(
        @Path("tmdbId") tmdbId: Long,
        @Query("mediaType") mediaType: String
    ): SimpleActionResponse

    @GET("/api/user/history")
    suspend fun getUserHistory(): UserHistoryResponse

    @GET("/api/downloads/server/list")
    suspend fun getServerDownloads(): ServerDownloadsResponse

    @GET("/api/{type}/{id}/trailer")
    suspend fun getTrailer(
        @Path("type") type: String,
        @Path("id") id: Long,
        @Query("lang") lang: String = "ru"
    ): TrailerResponse
}

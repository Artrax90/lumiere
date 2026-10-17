package com.lumiere.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class HealthResponse(
    val status: String,
    val name: String? = null,
    val version: String? = null
)

@Serializable
data class SetupStatusResponse(
    val needsSetup: Boolean = false
)

@Serializable
data class LanStatusResponse(
    val isLan: Boolean = false
)

@Serializable
data class Profile(
    val id: Long,
    val name: String,
    val email: String? = null,
    val avatar: String? = null,
    val role: String? = "user",
    @SerialName("isKids") val isKids: Boolean = false,
    @SerialName("hasPin") val hasPin: Boolean = false
)

@Serializable
data class ProfilesResponse(
    val profiles: List<Profile> = emptyList()
)

@Serializable
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: Profile
)

@Serializable
data class QuickLoginRequest(
    val userId: Long,
    val pin: String? = null
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RefreshRequest(
    val refreshToken: String
)

@Serializable
data class RefreshResponse(
    val accessToken: String,
    val refreshToken: String
)

@Serializable
data class Title(
    val id: Long,
    val tmdbId: Long? = null,
    val name: String,
    val type: String? = "movie",
    val year: Int? = null,
    val runtime: String? = null,
    val rating: String? = null,
    val score: Double? = null,
    val genres: List<String> = emptyList(),
    val description: String? = null,
    val overview: String? = null,
    val backdrop: String? = null,
    val poster: String? = null,
    val logoText: String? = null,
    val director: String? = null,
    val originalTitle: String? = null,
    val countries: List<String> = emptyList(),
    val releaseDate: String? = null,
    val tagline: String? = null,
    val productionCompanies: List<String> = emptyList(),
    val cast: List<CastMember> = emptyList(),
    val seasonsCount: Int? = null,
    val progress: Double? = null,
    val videoUrl: String? = null,
    val directUrl: String? = null,
    val hlsUrl: String? = null
)

@Serializable
data class CastMember(
    val id: Long? = null,
    val name: String,
    val role: String? = null,
    val image: String? = null
)

@Serializable
data class Genre(
    val id: Int,
    val name: String
)

@Serializable
data class GenreListResponse(
    val genres: List<Genre> = emptyList()
)

@Serializable
data class TitleListResponse(
    val results: List<Title> = emptyList(),
    val page: Int? = 1,
    val totalPages: Int? = 1,
    val totalResults: Int? = 0
)

@Serializable
data class Episode(
    val id: String? = null,
    val seriesId: Long? = null,
    val season: Int,
    val episode: Int,
    val title: String? = null,
    val synopsis: String? = null,
    val runtime: String? = null,
    val thumbnail: String? = null,
    val aired: String? = null,
    val isAired: Boolean? = true,
    val progress: Double? = null
)

@Serializable
data class SeasonResponse(
    val episodes: List<Episode> = emptyList()
)

@Serializable
data class TorrentFile(
    val id: Int? = 0,
    val index: Int? = null,
    val name: String = "",
    val path: String? = null,
    val size: Long? = null,
    val sizeFormatted: String? = null,
    val directUrl: String? = null,
    val streamUrl: String? = null,
    val hlsUrl: String? = null
)

@Serializable
data class TorrentItem(
    val title: String,
    val magnet: String,
    val size: String? = null,
    val sizeFormatted: String? = null,
    val sizeBytes: Long? = null,
    val seeders: Int? = 0,
    val leechers: Int? = 0,
    val tracker: String? = null,
    val quality: String? = null,
    val resolution: String? = null,
    val codec: String? = null,
    val ripType: String? = null,
    val audio: String? = null,
    val voiceover: String? = null,
    val files: List<TorrentFile> = emptyList()
)

@Serializable
data class TorrentSearchResponse(
    val torrents: List<TorrentItem> = emptyList(),
    val results: List<TorrentItem> = emptyList()
)

@Serializable
data class TorrentStreamRequest(
    val magnet: String,
    val title: String? = null
)

@Serializable
data class TorrentStreamInfoResponse(
    val hash: String? = null,
    val name: String? = null,
    val files: List<TorrentFile> = emptyList(),
    val pending: Boolean? = false,
    val error: String? = null
)

@Serializable
data class TorrServerTorrentStat(
    val hash: String,
    val title: String? = null,
    val stat: Int? = null,
    @SerialName("stat_string") val statString: String? = null,
    @SerialName("download_speed") val downloadSpeed: Double? = 0.0,
    @SerialName("upload_speed") val uploadSpeed: Double? = 0.0,
    @SerialName("total_bytes") val totalBytes: Long? = 0L,
    @SerialName("loaded_bytes") val loadedBytes: Long? = 0L,
    @SerialName("connected_seeders") val connectedSeeders: Int? = 0,
    @SerialName("active_peers") val activePeers: Int? = 0,
    @SerialName("total_peers") val totalPeers: Int? = 0,
    @SerialName("preloaded_bytes") val preloadedBytes: Long? = 0L,
    @SerialName("preload_size") val preloadSize: Long? = 0L
)

@Serializable
data class IptvParseRequest(
    val url: String? = null
)

@Serializable
data class IptvChannel(
    val id: String,
    val name: String,
    val url: String,
    val logo: String? = null,
    val group: String? = "Общие",
    val tvgId: String? = null,
    val tvgName: String? = null,
    val currentProgram: String? = null,
    val nextProgram: String? = null
)

@Serializable
data class IptvParseResponse(
    val channels: List<IptvChannel> = emptyList(),
    val groups: List<String> = emptyList(),
    val epgUrl: String? = null,
    val total: Int = 0,
    val source: String? = null
)

@Serializable
data class EpgProgram(
    val channel: String? = null,
    val title: String = "",
    val start: String = "",
    val stop: String = "",
    val startTime: String? = null,
    val stopTime: String? = null,
    val desc: String? = null
)

@Serializable
data class EpgResponse(
    val epg: Map<String, List<EpgProgram>> = emptyMap(),
    val channelMap: Map<String, String> = emptyMap(),
    val iconMap: Map<String, String> = emptyMap()
)

@Serializable
data class WatchProgressSyncItem(
    val tmdbId: Long,
    val mediaType: String,
    val titleName: String,
    val poster: String? = null,
    val progress: Long? = null,
    val timestamp: Long? = null
)

@Serializable
data class SyncPullResponse(
    val watchHistory: List<WatchProgressSyncItem> = emptyList(),
    val favorites: List<WatchProgressSyncItem> = emptyList(),
    val syncedAt: String? = null
)

@Serializable
data class FavoriteItem(
    val id: Long? = null,
    val tmdbId: Long,
    val mediaType: String? = "movie",
    val titleName: String? = null,
    val poster: String? = null
)

@Serializable
data class FavoritesResponse(
    val favorites: List<FavoriteItem> = emptyList()
)

@Serializable
data class FavoriteRequest(
    val tmdbId: Long,
    val mediaType: String? = "movie",
    val titleName: String? = null,
    val poster: String? = null,
    val userId: Long? = null
)

@Serializable
data class WatchlistItem(
    val id: Long? = null,
    val tmdbId: Long,
    val mediaType: String? = "movie",
    val titleName: String? = null,
    val poster: String? = null,
    val year: String? = null,
    val score: Double? = null
)

@Serializable
data class WatchlistResponse(
    val watchlist: List<WatchlistItem> = emptyList()
)

@Serializable
data class WatchlistRequest(
    val tmdbId: Long,
    val mediaType: String? = "movie",
    val titleName: String? = null,
    val poster: String? = null,
    val year: String? = null,
    val score: Double? = null,
    val userId: Long? = null
)

@Serializable
data class SubscriptionStatusResponse(
    val isSubscribed: Boolean = false
)

@Serializable
data class SubscribeRequest(
    val tmdbId: Long,
    val mediaType: String? = "movie",
    val title: String? = null,
    val poster: String? = null,
    val year: Int? = null,
    val lastSeason: Int? = 0,
    val lastEpisode: Int? = 0,
    val userId: Long? = null
)

@Serializable
data class TrailerItem(
    val url: String? = null,
    val embedUrl: String? = null,
    val streamUrl: String? = null,
    val title: String? = null
)

@Serializable
data class TrailerResponse(
    val trailer: TrailerItem? = null
)

@Serializable
data class SimpleActionResponse(
    val success: Boolean = true,
    val message: String? = null
)

@Serializable
data class AppNotification(
    val id: Long,
    val title: String,
    val message: String,
    val mediaType: String? = "movie",
    val mediaId: Long? = 0L,
    val poster: String? = null,
    val isRead: Boolean = false,
    val createdAt: String? = null
)

@Serializable
data class NotificationsResponse(
    val notifications: List<AppNotification> = emptyList(),
    val unreadCount: Int = 0
)

@Serializable
data class UserHistoryItem(
    val id: Long? = null,
    val tmdbId: Long,
    val mediaType: String? = "movie",
    val titleName: String? = null,
    val poster: String? = null,
    val progress: Long? = 0L,
    val timestamp: Long? = 0L,
    val updatedAt: String? = null
)

@Serializable
data class UserHistoryResponse(
    val history: List<UserHistoryItem> = emptyList()
)

@Serializable
data class DiskInfo(
    val free: String? = null,
    val total: String? = null
)

@Serializable
data class ServerDownloadItem(
    val id: String,
    val userId: Long? = null,
    val title: String,
    val mediaType: String? = "movie",
    val mediaId: Long? = 0L,
    val season: Int? = 0,
    val episode: Int? = 0,
    val fileName: String? = null,
    val fileSize: Long? = 0L,
    val fileSizeFormatted: String? = null,
    val downloadedBytes: Long? = 0L,
    val downloadedBytesFormatted: String? = null,
    val progress: Int = 0,
    val status: String = "completed",
    val poster: String? = null,
    val streamUrl: String? = null,
    val createdAt: String? = null,
    val completedAt: String? = null
)

@Serializable
data class ServerDownloadsResponse(
    val downloads: List<ServerDownloadItem> = emptyList(),
    val disk: DiskInfo? = null
)



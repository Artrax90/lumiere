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
    val seasonsCount: Int? = null,
    val progress: Double? = null,
    val videoUrl: String? = null,
    val directUrl: String? = null,
    val hlsUrl: String? = null
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
    val channel: String,
    val title: String,
    val start: String,
    val stop: String,
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

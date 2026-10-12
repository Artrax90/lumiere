package com.lumiere.tv.navigation

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

sealed class Screen(val route: String) {
    data object Connect : Screen("connect")
    data object Profiles : Screen("profiles")
    data object Home : Screen("home")
    data object Search : Screen("search")
    data object Iptv : Screen("iptv")
    data object Settings : Screen("settings")

    data object Details : Screen("details/{id}/{type}") {
        fun createRoute(id: Long, type: String = "movie"): String {
            return "details/$id/$type"
        }
    }

    data object Player : Screen("player?url={url}&title={title}&subtitle={subtitle}&hls={hls}&mediaId={mediaId}&mediaType={mediaType}&season={season}&episode={episode}") {
        fun createRoute(
            streamUrl: String,
            title: String,
            subtitle: String = "",
            isHls: Boolean = false,
            mediaId: Long = 0L,
            mediaType: String = "movie",
            season: Int = 0,
            episode: Int = 0
        ): String {
            val encUrl = URLEncoder.encode(streamUrl, StandardCharsets.UTF_8.toString())
            val encTitle = URLEncoder.encode(title, StandardCharsets.UTF_8.toString())
            val encSub = URLEncoder.encode(subtitle, StandardCharsets.UTF_8.toString())
            return "player?url=$encUrl&title=$encTitle&subtitle=$encSub&hls=$isHls&mediaId=$mediaId&mediaType=$mediaType&season=$season&episode=$episode"
        }
    }
}

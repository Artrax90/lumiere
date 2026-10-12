package com.lumiere.core.network

import com.lumiere.core.model.*
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class LumiereApiTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    @Test
    fun testHealthResponseParsing() {
        val raw = """{"status":"ok","name":"lumiere","version":"1.0.0"}"""
        val response = json.decodeFromString<HealthResponse>(raw)
        assertEquals("ok", response.status)
        assertEquals("lumiere", response.name)
    }

    @Test
    fun testProfilesResponseParsing() {
        val raw = """
            {
                "profiles": [
                    {
                        "id": 1,
                        "name": "Основной",
                        "email": "user@lumiere.tv",
                        "avatar": "/avatar.png",
                        "role": "admin",
                        "isKids": false,
                        "hasPin": true
                    },
                    {
                        "id": 2,
                        "name": "Дети",
                        "role": "user",
                        "isKids": true,
                        "hasPin": false
                    }
                ]
            }
        """.trimIndent()
        val response = json.decodeFromString<ProfilesResponse>(raw)
        assertEquals(2, response.profiles.size)
        assertEquals(1L, response.profiles[0].id)
        assertEquals("Основной", response.profiles[0].name)
        assertTrue(response.profiles[0].hasPin)
        assertTrue(response.profiles[1].isKids)
    }

    @Test
    fun testTitleListResponseParsing() {
        val raw = """
            {
                "results": [
                    {
                        "id": 550,
                        "name": "Fight Club",
                        "type": "movie",
                        "year": 1999,
                        "score": 8.4,
                        "rating": "8.4",
                        "genres": ["Drama", "Thriller"],
                        "description": "An insomniac office worker...",
                        "backdrop": "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
                        "poster": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg"
                    }
                ],
                "page": 1,
                "totalPages": 5,
                "totalResults": 100
            }
        """.trimIndent()
        val response = json.decodeFromString<TitleListResponse>(raw)
        assertEquals(1, response.results.size)
        val title = response.results[0]
        assertEquals(550L, title.id)
        assertEquals("Fight Club", title.name)
        assertEquals(1999, title.year)
        assertEquals(8.4, title.score ?: 0.0, 0.01)
        assertEquals(2, title.genres.size)
    }

    @Test
    fun testSeasonEpisodesParsing() {
        val raw = """
            {
                "episodes": [
                    {
                        "id": "ep-1-1",
                        "seriesId": 1399,
                        "season": 1,
                        "episode": 1,
                        "title": "Winter Is Coming",
                        "synopsis": "Jon Arryn, the Hand of the King, is dead.",
                        "runtime": "62",
                        "thumbnail": "/thumbnail.jpg"
                    }
                ]
            }
        """.trimIndent()
        val response = json.decodeFromString<SeasonResponse>(raw)
        assertEquals(1, response.episodes.size)
        assertEquals(1, response.episodes[0].season)
        assertEquals(1, response.episodes[0].episode)
        assertEquals("Winter Is Coming", response.episodes[0].title)
    }

    @Test
    fun testTorrentSearchParsing() {
        val raw = """
            {
                "torrents": [
                    {
                        "title": "Inception 2010 1080p BluRay Remux",
                        "magnet": "magnet:?xt=urn:btih:abcdef1234567890",
                        "size": "25.4 GB",
                        "sizeBytes": 27273052160,
                        "seeders": 128,
                        "leechers": 12,
                        "tracker": "RuTracker",
                        "quality": "1080p",
                        "codec": "H.264"
                    }
                ]
            }
        """.trimIndent()
        val response = json.decodeFromString<TorrentSearchResponse>(raw)
        assertEquals(1, response.torrents.size)
        val item = response.torrents[0]
        assertEquals("Inception 2010 1080p BluRay Remux", item.title)
        assertEquals(128, item.seeders)
        assertEquals("1080p", item.quality)
    }

    @Test
    fun testTorrentStreamInfoParsing() {
        val raw = """
            {
                "hash": "abcdef1234567890",
                "name": "Inception (2010)",
                "files": [
                    {
                        "id": 0,
                        "name": "Inception.mkv",
                        "path": "Inception (2010)/Inception.mkv",
                        "size": 27273052160,
                        "directUrl": "/api/torrents/proxy/video.mkv?link=magnet&index=0",
                        "streamUrl": "/api/torrents/proxy/video.mkv?link=magnet&index=0"
                    }
                ]
            }
        """.trimIndent()
        val response = json.decodeFromString<TorrentStreamInfoResponse>(raw)
        assertEquals("abcdef1234567890", response.hash)
        assertEquals(1, response.files.size)
        assertEquals(0, response.files[0].id)
        assertEquals("Inception.mkv", response.files[0].name)
    }

    @Test
    fun testIptvParseResponseParsing() {
        val raw = """
            {
                "channels": [
                    {
                        "id": "ch-1",
                        "name": "Первый канал HD",
                        "url": "http://stream.m3u8",
                        "logo": "http://logo.png",
                        "group": "Общие",
                        "tvgId": "1tv"
                    }
                ],
                "groups": ["Общие", "Кино"],
                "total": 1
            }
        """.trimIndent()
        val response = json.decodeFromString<IptvParseResponse>(raw)
        assertEquals(1, response.channels.size)
        assertEquals("Первый канал HD", response.channels[0].name)
        assertEquals("Общие", response.channels[0].group)
    }
}

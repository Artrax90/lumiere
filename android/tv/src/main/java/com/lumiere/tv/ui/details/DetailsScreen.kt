package com.lumiere.tv.ui.details

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.SeasonPicker
import com.lumiere.tv.ui.components.TorrentDialog
import com.lumiere.tv.ui.components.TorrentMetaParser
import com.lumiere.tv.ui.components.TorrentRowItem

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DetailsScreen(
    mediaId: Long,
    mediaType: String,
    onBackClick: () -> Unit,
    onPlayRequested: (streamUrl: String, title: String, subtitle: String, isHls: Boolean, startPositionMs: Long, poster: String, season: Int, episode: Int) -> Unit,
    onSimilarTitleClick: ((Title) -> Unit)? = null,
    viewModel: DetailsViewModel
) {
    val state by viewModel.uiState.collectAsState()
    val title = state.title
    val watchFocusRequester = remember { FocusRequester() }

    val listState = androidx.compose.foundation.lazy.rememberLazyListState()

    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                viewModel.reloadProgress()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(title, state.lastWatchedEpisodeNum) {
        if (title != null) {
            if (mediaType == "tv" && state.lastWatchedEpisodeNum != null) {
                kotlinx.coroutines.delay(200)
                try {
                    listState.animateScrollToItem(2)
                } catch (_: Exception) {}
            } else {
                kotlinx.coroutines.delay(150)
                try {
                    watchFocusRequester.requestFocus()
                } catch (_: Exception) {}
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        if (title != null) {
            // Full-bleed Backdrop Background with Gradient Fade
            AsyncImage(
                model = viewModel.resolveImageUrl(title.backdrop),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(480.dp)
            )

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                BackgroundDark.copy(alpha = 0.5f),
                                BackgroundDark.copy(alpha = 0.9f),
                                BackgroundDark
                            )
                        )
                    )
            )

            // Scrollable Details Body
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 48.dp, vertical = 28.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                // Top Navigation Bar (Back Button)
                item {
                    val backShape = RoundedCornerShape(10.dp)
                    OutlinedButton(
                        onClick = onBackClick,
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = backShape),
                            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = backShape)
                        ),
                        shape = OutlinedButtonDefaults.shape(backShape),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Назад",
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Назад", style = MaterialTheme.typography.labelMedium)
                    }
                }

                // Main Details Card (Poster + Metadata)
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(32.dp)
                    ) {
                        // Poster (2:3)
                        Box(
                            modifier = Modifier
                                .width(220.dp)
                                .height(330.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                        ) {
                            AsyncImage(
                                model = viewModel.resolveImageUrl(title.poster),
                                contentDescription = title.name,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        }

                        // Info Column
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Text(
                                text = title.name,
                                style = MaterialTheme.typography.displayMedium,
                                color = TextPrimary
                            )

                            val orig = title.originalTitle
                            if (!orig.isNullOrBlank() && orig != title.name) {
                                Text(
                                    text = orig,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = TextSecondary
                                )
                            }

                            // Metadata Badges (Rating, Year, Duration, Genres)
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val score = title.score ?: title.rating?.toDoubleOrNull()
                                if (score != null && score > 0.0) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(Color(0xD907090E))
                                            .border(1.dp, LumiereGoldGlow, RoundedCornerShape(6.dp))
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = "★ ${String.format("%.1f", score)}",
                                            color = LumiereGold,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }

                                val year = title.year
                                if (year != null && year > 0) {
                                    Text(
                                        text = year.toString(),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = TextSecondary
                                    )
                                }

                                val runtime = title.runtime
                                if (!runtime.isNullOrBlank()) {
                                    Text(
                                        text = "• $runtime",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = TextSecondary
                                    )
                                }

                                if (title.genres.isNotEmpty()) {
                                    Text(
                                        text = "• " + title.genres.take(3).joinToString(", "),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = TextSecondary
                                    )
                                }
                            }

                            val overview = title.overview ?: title.description
                            if (!overview.isNullOrBlank()) {
                                Text(
                                    text = overview,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = TextSecondary,
                                    lineHeight = 22.sp
                                )
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            // Action Buttons (Scrollable Row)
                            androidx.compose.foundation.lazy.LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                val actionShape = RoundedCornerShape(12.dp)

                                // 1. Play Button
                                item {
                                    Button(
                                        onClick = {
                                            viewModel.playResumeOrOpenDialog { streamUrl, playTitle, subtitle, isHls ->
                                                val startPos = (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                                                val sNum = if (mediaType == "tv") state.selectedSeason else 0
                                                val eNum = if (mediaType == "tv") (state.lastWatchedEpisodeNum ?: 1) else 0
                                                onPlayRequested(streamUrl, playTitle, subtitle, isHls, startPos, title.poster.orEmpty(), sNum, eNum)
                                            }
                                        },
                                        modifier = Modifier.focusRequester(watchFocusRequester),
                                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                        colors = ButtonDefaults.colors(
                                            containerColor = LumiereGold,
                                            contentColor = BackgroundDark,
                                            focusedContainerColor = Color.White,
                                            focusedContentColor = BackgroundDark
                                        ),
                                        border = ButtonDefaults.border(
                                            focusedBorder = Border(border = BorderStroke(2.5.dp, Color.White), shape = actionShape),
                                            border = Border.None
                                        ),
                                        shape = ButtonDefaults.shape(actionShape)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.PlayArrow,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        val watchButtonText = when {
                                            state.isStartingStream -> "Запуск..."
                                            state.savedProgressSec > 60L -> {
                                                val minutes = state.savedProgressSec / 60
                                                "Продолжить (${minutes} мин)"
                                            }
                                            else -> "Смотреть"
                                        }
                                        Text(
                                            text = watchButtonText,
                                            style = MaterialTheme.typography.labelLarge,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }

                                // 2. All Torrents / Quality ("Все раздачи")
                                item {
                                    OutlinedButton(
                                        onClick = { viewModel.openTorrentDialog() },
                                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                        colors = OutlinedButtonDefaults.colors(
                                            focusedContainerColor = Color(0x22FFFFFF),
                                            focusedContentColor = TextPrimary
                                        ),
                                        border = OutlinedButtonDefaults.border(
                                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = actionShape),
                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape)
                                        ),
                                        shape = OutlinedButtonDefaults.shape(actionShape)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Download,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        val torrentCount = state.torrents.size
                                        Text(
                                            text = if (torrentCount > 0) "Все раздачи ($torrentCount)" else "Все раздачи",
                                            style = MaterialTheme.typography.labelLarge
                                        )
                                    }
                                }

                                // 3. Watchlist ("Буду смотреть")
                                item {
                                    OutlinedButton(
                                        onClick = { viewModel.toggleWatchlist() },
                                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                        colors = OutlinedButtonDefaults.colors(
                                            containerColor = if (state.isInWatchlist) Color(0x18FFFFFF) else Color.Transparent,
                                            contentColor = if (state.isInWatchlist) LumiereGold else TextPrimary,
                                            focusedContainerColor = LumiereGold,
                                            focusedContentColor = BackgroundDark
                                        ),
                                        border = OutlinedButtonDefaults.border(
                                            border = Border(border = BorderStroke(1.dp, if (state.isInWatchlist) Color(0x44E8C170) else SurfaceBorder), shape = actionShape),
                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape)
                                        ),
                                        shape = OutlinedButtonDefaults.shape(actionShape)
                                    ) {
                                        Icon(
                                            imageVector = if (state.isInWatchlist) Icons.Default.Check else Icons.Default.Add,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = if (state.isInWatchlist) "Буду смотреть ✓" else "Буду смотреть",
                                            style = MaterialTheme.typography.labelLarge
                                        )
                                    }
                                }

                                // 4. Favorites ("В закладки / Нравится")
                                item {
                                    OutlinedButton(
                                        onClick = { viewModel.toggleFavorite() },
                                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                        colors = OutlinedButtonDefaults.colors(
                                            containerColor = if (state.isFavorite) Color(0x18FF4081) else Color.Transparent,
                                            contentColor = if (state.isFavorite) Color(0xFFFF5252) else TextPrimary,
                                            focusedContainerColor = Color(0xFFFF5252),
                                            focusedContentColor = Color.White
                                        ),
                                        border = OutlinedButtonDefaults.border(
                                            border = Border(border = BorderStroke(1.dp, if (state.isFavorite) Color(0x44FF4081) else SurfaceBorder), shape = actionShape),
                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape)
                                        ),
                                        shape = OutlinedButtonDefaults.shape(actionShape)
                                    ) {
                                        Icon(
                                            imageVector = if (state.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = if (state.isFavorite) "В закладках ♥" else "В закладки",
                                            style = MaterialTheme.typography.labelLarge
                                        )
                                    }
                                }

                                // 5. Notifications Bell ("Следить за новыми сериями / релизом")
                                item {
                                    OutlinedButton(
                                        onClick = { viewModel.toggleNotificationSubscription() },
                                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                                        colors = OutlinedButtonDefaults.colors(
                                            containerColor = if (state.isSubscribed) Color(0x33E8C170) else Color.Transparent,
                                            contentColor = if (state.isSubscribed) LumiereGold else TextPrimary,
                                            focusedContainerColor = LumiereGold,
                                            focusedContentColor = BackgroundDark
                                        ),
                                        border = OutlinedButtonDefaults.border(
                                            border = Border(border = BorderStroke(1.dp, if (state.isSubscribed) Color(0x66E8C170) else SurfaceBorder), shape = actionShape),
                                            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = actionShape)
                                        ),
                                        shape = OutlinedButtonDefaults.shape(actionShape)
                                    ) {
                                        Icon(
                                            imageVector = if (state.isSubscribed) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = if (state.isSubscribed) {
                                                "Отслеживается 🔔"
                                            } else if (mediaType == "tv") {
                                                "Следить за новыми сериями"
                                            } else {
                                                "Следить за релизом"
                                            },
                                            style = MaterialTheme.typography.labelLarge
                                        )
                                    }
                                }

                                // 6. Trailer button
                                item {
                                    OutlinedButton(
                                        onClick = {
                                            viewModel.playTrailer { trailerUrl ->
                                                onPlayRequested(trailerUrl, "${title.name} (Трейлер)", "", trailerUrl.contains(".m3u8"), 0L, "", 0, 0)
                                            }
                                        },
                                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                                        colors = OutlinedButtonDefaults.colors(
                                            focusedContainerColor = Color(0x22FFFFFF),
                                            focusedContentColor = TextPrimary
                                        ),
                                        border = OutlinedButtonDefaults.border(
                                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = actionShape),
                                            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = actionShape)
                                        ),
                                        shape = OutlinedButtonDefaults.shape(actionShape)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Movie,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Трейлер", style = MaterialTheme.typography.labelLarge)
                                    }
                                }
                            }
                        }
                    }
                }

                // If TV Series: Seasons and Episodes Row / Torrents Tab
                if (mediaType == "tv") {
                    item {
                        val seriesTab = state.seriesTab
                        val qualityFilter = state.torrentQualityFilter
                        val sortBy = state.torrentSortBy

                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            // Section Tabs Row: [ Сезоны и серии ] and [ Торренты (count) ]
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val tabShape = RoundedCornerShape(20.dp)
                                val isEpisodesTab = seriesTab == "episodes"
                                Button(
                                    onClick = { viewModel.setSeriesTab("episodes") },
                                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.04f),
                                    colors = ButtonDefaults.colors(
                                        containerColor = if (isEpisodesTab) Color(0x22FFFFFF) else Color(0x10FFFFFF),
                                        contentColor = if (isEpisodesTab) LumiereGold else TextSecondary,
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = ButtonDefaults.border(
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = tabShape),
                                        border = Border.None
                                    ),
                                    shape = ButtonDefaults.shape(tabShape),
                                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        text = "Сезоны и серии",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = if (isEpisodesTab) FontWeight.Bold else FontWeight.Medium
                                    )
                                }

                                val isTorrentsTab = seriesTab == "torrents"
                                Button(
                                    onClick = { viewModel.setSeriesTab("torrents") },
                                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.04f),
                                    colors = ButtonDefaults.colors(
                                        containerColor = if (isTorrentsTab) Color(0x22FFFFFF) else Color(0x10FFFFFF),
                                        contentColor = if (isTorrentsTab) LumiereGold else TextSecondary,
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = ButtonDefaults.border(
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = tabShape),
                                        border = Border.None
                                    ),
                                    shape = ButtonDefaults.shape(tabShape),
                                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        text = if (state.torrents.isNotEmpty()) "Торренты (${state.torrents.size})" else "Торренты",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = if (isTorrentsTab) FontWeight.Bold else FontWeight.Medium
                                    )
                                }
                            }

                            if (seriesTab == "episodes") {
                                SeasonPicker(
                                    seasonsCount = title.seasonsCount ?: 1,
                                    selectedSeason = state.selectedSeason,
                                    onSeasonSelect = { viewModel.selectSeason(it) },
                                    episodes = state.episodes,
                                    resolveImageUrl = { viewModel.resolveImageUrl(it) },
                                    lastWatchedEpisodeNum = state.lastWatchedEpisodeNum,
                                    fallbackPosterUrl = title.backdrop.orEmpty().ifBlank { title.poster.orEmpty() },
                                    onEpisodeClick = { ep ->
                                        viewModel.playEpisodeDirectly(ep) { streamUrl, epTitle, subtitle, isHls ->
                                            val startPos = if (state.selectedSeason == ep.season && state.lastWatchedEpisodeNum == ep.episode) {
                                                (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                                            } else {
                                                0L
                                            }
                                            onPlayRequested(streamUrl, epTitle, subtitle, isHls, startPos, title.poster.orEmpty(), ep.season, ep.episode)
                                        }
                                    }
                                )
                            } else {
                                // Torrents Tab View with Filters & Sort
                                val filteredTorrents = remember(state.torrents, qualityFilter, sortBy, state.selectedSeason) {
                                    var list = state.torrents.filter { item ->
                                        val matchesSeason = if (mediaType == "tv" && state.selectedSeason > 0) {
                                            TorrentMetaParser.matchesTorrentSeason(item.title, state.selectedSeason, title.year)
                                        } else true
                                        val meta = TorrentMetaParser.parse(item.title, item.audio, item.quality)
                                        val matchesQuality = when (qualityFilter) {
                                            "4k" -> meta.resolution == "4K UHD"
                                            "1080p" -> meta.resolution == "1080p"
                                            "720p" -> meta.resolution == "720p"
                                            else -> true
                                        }
                                        matchesSeason && matchesQuality
                                    }
                                    if (list.isEmpty() && state.torrents.isNotEmpty()) {
                                        list = state.torrents
                                    }
                                    when (sortBy) {
                                        "seeds" -> list.sortedByDescending { it.seeders ?: 0 }
                                        "size" -> list.sortedByDescending { TorrentMetaParser.parseSizeBytes(it) }
                                        "date" -> list.sortedWith(
                                            compareByDescending<com.lumiere.core.model.TorrentItem> { TorrentMetaParser.parseTorrentDate(it.date) }
                                                .thenByDescending { it.seeders ?: 0 }
                                        )
                                        else -> list.sortedByDescending { (it.seeders ?: 0) * 10 + if ((it.title.contains("4k", true) || it.title.contains("2160p", true))) 50 else 0 }
                                    }
                                }

                                Column(
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    // Quality & Sort Filter Bar
                                    if (state.torrents.isNotEmpty()) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(SurfaceDark)
                                                .padding(horizontal = 14.dp, vertical = 8.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            // Quality Filters
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text("Качество:", fontSize = 11.sp, color = TextMuted)
                                                listOf(
                                                    "all" to "Все",
                                                    "4k" to "4K",
                                                    "1080p" to "1080p",
                                                    "720p" to "720p"
                                                ).forEach { (id, label) ->
                                                    val isSelected = qualityFilter == id
                                                    val filterShape = RoundedCornerShape(8.dp)
                                                    Button(
                                                        onClick = { viewModel.setTorrentQualityFilter(id) },
                                                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                                        colors = ButtonDefaults.colors(
                                                            containerColor = if (isSelected) Color(0x22FFFFFF) else Color(0x10FFFFFF),
                                                            contentColor = if (isSelected) LumiereGold else TextSecondary,
                                                            focusedContainerColor = LumiereGold,
                                                            focusedContentColor = BackgroundDark
                                                        ),
                                                        border = ButtonDefaults.border(
                                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = filterShape),
                                                            border = Border.None
                                                        ),
                                                        shape = ButtonDefaults.shape(filterShape),
                                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 3.dp)
                                                    ) {
                                                        Text(label, fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                                                    }
                                                }
                                            }

                                            // Sort Controls
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text("Сортировка:", fontSize = 11.sp, color = TextMuted)
                                                listOf(
                                                    "score" to "По рейтингу",
                                                    "seeds" to "По сидам",
                                                    "date" to "По дате",
                                                    "size" to "По размеру"
                                                ).forEach { (id, label) ->
                                                    val isSelected = sortBy == id
                                                    val sortShape = RoundedCornerShape(8.dp)
                                                    Button(
                                                        onClick = { viewModel.setTorrentSortBy(id) },
                                                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                                        colors = ButtonDefaults.colors(
                                                            containerColor = if (isSelected) Color(0x22FFFFFF) else Color(0x10FFFFFF),
                                                            contentColor = if (isSelected) LumiereGold else TextSecondary,
                                                            focusedContainerColor = LumiereGold,
                                                            focusedContentColor = BackgroundDark
                                                        ),
                                                        border = ButtonDefaults.border(
                                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = sortShape),
                                                            border = Border.None
                                                        ),
                                                        shape = ButtonDefaults.shape(sortShape),
                                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 3.dp)
                                                    ) {
                                                        Text(label, fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if (state.isSearchingTorrents && state.torrents.isEmpty()) {
                                        Box(
                                            modifier = Modifier.fillMaxWidth().height(120.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text("Поиск доступных раздач...", color = TextSecondary, fontSize = 14.sp)
                                        }
                                    } else if (filteredTorrents.isEmpty()) {
                                        Box(
                                            modifier = Modifier.fillMaxWidth().height(120.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text("Раздачи не найдены", color = TextMuted, fontSize = 14.sp)
                                        }
                                    } else {
                                        filteredTorrents.forEach { torrent ->
                                            TorrentRowItem(
                                                item = torrent,
                                                isLaunching = state.isStartingStream && state.activeTorrent?.magnet == torrent.magnet,
                                                isSelected = !state.lastPlayedTorrentMagnet.isNullOrBlank() && torrent.magnet == state.lastPlayedTorrentMagnet,
                                                onClick = {
                                                    viewModel.playTorrent(torrent) { streamUrl, playTitle, subtitle, isHls ->
                                                        val sNum = state.selectedEpisode?.season ?: (if (mediaType == "tv") state.selectedSeason else 0)
                                                        val eNum = state.selectedEpisode?.episode ?: (if (mediaType == "tv") (state.lastWatchedEpisodeNum ?: 1) else 0)
                                                        val startPos = if (mediaType == "tv") {
                                                            if (state.selectedEpisode?.season == state.selectedSeason && state.selectedEpisode?.episode == state.lastWatchedEpisodeNum) {
                                                                (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                                                            } else {
                                                                0L
                                                            }
                                                        } else {
                                                            (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                                                        }
                                                        onPlayRequested(streamUrl, playTitle, subtitle, isHls, startPos, title.poster.orEmpty(), sNum, eNum)
                                                    }
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Similar / Recommendations row
                if (state.similarTitles.isNotEmpty()) {
                    item {
                        com.lumiere.tv.ui.components.MediaRow(
                            title = "Похожие " + if (mediaType == "tv") "сериалы" else "фильмы",
                            subtitle = "Вам также может понравиться",
                            items = state.similarTitles,
                            resolvePosterUrl = { viewModel.resolveImageUrl(it) },
                            onTitleClick = { simTitle ->
                                onSimilarTitleClick?.invoke(simTitle)
                            }
                        )
                    }
                }
            }
        } else if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "Загрузка информации...",
                    style = MaterialTheme.typography.headlineMedium,
                    color = LumiereGold
                )
            }
        }

        AnimatedVisibility(visible = state.errorMessage != null) {
            Text(
                text = state.errorMessage.orEmpty(),
                color = ErrorRed,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(32.dp)
            )
        }

        // Torrent Selection Modal
        if (state.showTorrentDialog) {
            TorrentDialog(
                torrents = state.torrents,
                isLoading = state.isSearchingTorrents,
                selectedMagnet = state.lastPlayedTorrentMagnet,
                onTorrentSelected = { torrent ->
                    viewModel.playTorrent(torrent) { streamUrl, playTitle, subtitle, isHls ->
                        val sNum = state.selectedEpisode?.season ?: (if (mediaType == "tv") state.selectedSeason else 0)
                        val eNum = state.selectedEpisode?.episode ?: (if (mediaType == "tv") (state.lastWatchedEpisodeNum ?: 1) else 0)
                        val startPos = if (mediaType == "tv") {
                            if (state.selectedEpisode?.season == state.selectedSeason && state.selectedEpisode?.episode == state.lastWatchedEpisodeNum) {
                                (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                            } else {
                                0L
                            }
                        } else {
                            (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                        }
                        onPlayRequested(streamUrl, playTitle, subtitle, isHls, startPos, title?.poster.orEmpty(), sNum, eNum)
                    }
                },
                onDismiss = { viewModel.dismissTorrentDialog() }
            )
        }

        // Stream Launch Loading Overlay
        if (state.isStartingStream) {
            val ep = state.selectedEpisode
            val torrent = state.activeTorrent ?: state.torrents.find { t ->
                ep != null && TorrentMetaParser.matchesTorrentSeason(t.title, ep.season)
            } ?: state.torrents.firstOrNull()
            val cancelFocusRequester = remember { FocusRequester() }

            androidx.activity.compose.BackHandler {
                viewModel.dismissStartingStream()
            }

            LaunchedEffect(Unit) {
                try {
                    cancelFocusRequester.requestFocus()
                } catch (_: Exception) {}
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xD9050608))
                    .clickable(enabled = false) {},
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier
                        .widthIn(min = 400.dp, max = 560.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(SurfaceDark)
                        .border(1.dp, SurfaceBorder, RoundedCornerShape(20.dp))
                        .padding(horizontal = 28.dp, vertical = 24.dp)
                ) {
                    androidx.compose.material3.CircularProgressIndicator(
                        color = LumiereGold,
                        modifier = Modifier.size(38.dp),
                        strokeWidth = 3.dp
                    )

                    // Episode Title / Main Title
                    Text(
                        text = if (ep != null) {
                            "Сезон ${ep.season}, Серия ${ep.episode}${if (!ep.title.isNullOrBlank()) " • ${ep.title}" else ""}"
                        } else {
                            state.title?.name ?: "Запуск видео"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Torrent Release Info Card (if selected or detected)
                    if (torrent != null) {
                        val meta = remember(torrent) {
                            TorrentMetaParser.parse(torrent.title, torrent.audio, torrent.quality)
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0x18FFFFFF))
                                .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(12.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Release Title
                            Text(
                                text = torrent.title,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimary,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                lineHeight = 16.sp
                            )

                            // Metadata Badges Row: Voices (Translation), Resolution, HDR, Seeds, Size
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Translation / Voice Studio Badges (most important!)
                                val voices = meta.voices.ifEmpty {
                                    listOfNotNull(torrent.voiceover)
                                }
                                if (voices.isNotEmpty()) {
                                    voices.take(2).forEach { v ->
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(5.dp))
                                                .background(Color(0x33A855F7))
                                                .border(1.dp, Color(0x88A855F7), RoundedCornerShape(5.dp))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(
                                                text = v,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFFD8B4FE)
                                            )
                                        }
                                    }
                                }

                                // Resolution
                                val res = meta.resolution ?: torrent.quality ?: "1080p"
                                val is4k = res.contains("4k", true) || res.contains("2160", true)
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(5.dp))
                                        .background(if (is4k) Color(0x33E8C170) else Color(0x2210B981))
                                        .border(1.dp, if (is4k) LumiereGold else Color(0x6610B981), RoundedCornerShape(5.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = res,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (is4k) LumiereGold else Color(0xFF6EE7B7)
                                    )
                                }

                                // HDR
                                if (meta.hdr != null) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(5.dp))
                                            .background(Color(0x33C084FC))
                                            .border(1.dp, Color(0x88C084FC), RoundedCornerShape(5.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = meta.hdr,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFFF0ABFC)
                                        )
                                    }
                                }

                                // Seeds
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(5.dp))
                                        .background(Color(0x2210B981))
                                        .border(1.dp, Color(0x6610B981), RoundedCornerShape(5.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "⚡ ${torrent.seeders ?: 0}",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF6EE7B7)
                                    )
                                }

                                // Size
                                val sizeStr = TorrentMetaParser.formatSizeSmart(torrent.sizeFormatted, torrent.sizeBytes, torrent.size)
                                if (!sizeStr.isNullOrBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(5.dp))
                                            .background(Color(0x18FFFFFF))
                                            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(5.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = sizeStr,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = TextSecondary
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Progress subtitle
                    Text(
                        text = "Поиск пиров в TorrServer и буферизация потока...",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(2.dp))

                    val cancelShape = RoundedCornerShape(10.dp)
                    OutlinedButton(
                        onClick = {
                            viewModel.dismissStartingStream()
                            viewModel.openTorrentDialog(ep)
                        },
                        modifier = Modifier.focusRequester(cancelFocusRequester),
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = cancelShape),
                            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = cancelShape)
                        ),
                        shape = OutlinedButtonDefaults.shape(cancelShape),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text("Выбрать другую раздачу", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

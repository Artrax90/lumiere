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
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.SeasonPicker
import com.lumiere.tv.ui.components.TorrentDialog
import com.lumiere.tv.ui.components.TorrentMetaParser
import com.lumiere.tv.ui.components.TorrentRowItem
import com.lumiere.tv.ui.components.DetailSpecsBlock
import com.lumiere.tv.ui.components.CastSectionWgt
import com.lumiere.tv.ui.components.AllCastDialog

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DetailsScreen(
    mediaId: Long,
    mediaType: String,
    onBackClick: () -> Unit,
    onPlayRequested: (streamUrl: String, title: String, subtitle: String, isHls: Boolean, startPositionMs: Long, poster: String, season: Int, episode: Int) -> Unit,
    onSimilarTitleClick: ((Title) -> Unit)? = null,
    onActorClick: ((personId: Long, personName: String) -> Unit)? = null,
    viewModel: DetailsViewModel
) {
    val state by viewModel.uiState.collectAsState()
    val title = state.title
    val isTv = mediaType == "tv"
    val watchFocusRequester = remember { FocusRequester() }
    val episodesTabFocusRequester = remember { FocusRequester() }
    val torrentsTabFocusRequester = remember { FocusRequester() }
    val bottomSectionFocusRequester = if (isTv) episodesTabFocusRequester else torrentsTabFocusRequester
    var showAllCastDialog by remember { mutableStateOf(false) }

    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    val actionDownModifier = remember(bottomSectionFocusRequester, coroutineScope, listState) {
        Modifier
            .focusProperties { down = bottomSectionFocusRequester }
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown &&
                    event.nativeKeyEvent.keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN
                ) {
                    try {
                        bottomSectionFocusRequester.requestFocus()
                    } catch (_: Exception) {
                        coroutineScope.launch {
                            try {
                                listState.animateScrollToItem(2)
                                kotlinx.coroutines.delay(50)
                                bottomSectionFocusRequester.requestFocus()
                            } catch (_: Exception) {}
                        }
                    }
                    true
                } else {
                    false
                }
            }
    }

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
            val context = androidx.compose.ui.platform.LocalContext.current
            val backdropRequest = androidx.compose.runtime.remember(title.backdrop) {
                coil3.request.ImageRequest.Builder(context)
                    .data(viewModel.resolveImageUrl(title.backdrop))
                    .size(1280, 720)
                    .build()
            }
            AsyncImage(
                model = backdropRequest,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(600.dp)
            )

            // Dual Gradient: Left-to-right dark gradient for text readability + Bottom fade
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                BackgroundDark.copy(alpha = 0.94f),
                                BackgroundDark.copy(alpha = 0.72f),
                                Color.Transparent
                            ),
                            startX = 0f,
                            endX = 1400f
                        )
                    )
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                BackgroundDark.copy(alpha = 0.80f),
                                BackgroundDark
                            ),
                            startY = 0f,
                            endY = 1600f
                        )
                    )
            )

            // Scrollable Details Body
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 36.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Top Navigation Bar (Back Button - WGT Pill Style)
                item {
                    val backShape = RoundedCornerShape(20.dp)
                    OutlinedButton(
                        onClick = onBackClick,
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                        colors = OutlinedButtonDefaults.colors(
                            containerColor = Color(0x24FFFFFF),
                            focusedContainerColor = LumiereGold,
                            focusedContentColor = BackgroundDark,
                            contentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(border = BorderStroke(1.dp, Color(0x35FFFFFF)), shape = backShape),
                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = backShape)
                        ),
                        shape = OutlinedButtonDefaults.shape(backShape),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                    ) {
                        Text("‹ Назад", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    }
                }

                // Upper Hero Section: Two sides (Left info/actions/specs, Right 4x2 Cast grid)
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        // Left Hero: Type/Genre, Title, Meta, Actions, Synopsis, DetailSpecsBlock
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            // Type + Genre Label Row
                            val typeLabel = when (title.type) {
                                "tv" -> "Сериал"
                                "anime" -> "Аниме"
                                else -> "Фильм"
                            }
                            val firstGenre = title.genres.firstOrNull()
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = typeLabel,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = LumiereGold
                                )
                                if (!firstGenre.isNullOrBlank()) {
                                    Text(
                                        text = "—",
                                        fontSize = 13.sp,
                                        color = TextMuted
                                    )
                                    Text(
                                        text = firstGenre,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = TextSecondary
                                    )
                                }
                            }

                            // Big Title (crisp & proportional)
                            Text(
                                text = title.name,
                                style = MaterialTheme.typography.displayMedium.copy(
                                    fontSize = 28.sp,
                                    lineHeight = 34.sp,
                                    fontWeight = FontWeight.Bold
                                ),
                                color = TextPrimary
                            )

                            // Metadata Badges (Rating, Year, Duration, Rating)
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val score = title.score ?: title.rating?.toDoubleOrNull()
                                if (score != null && score > 0.0) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(Color(0xD907090E))
                                            .border(1.dp, LumiereGoldGlow, RoundedCornerShape(6.dp))
                                            .padding(horizontal = 7.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "★ ${String.format("%.1f", score)}",
                                            color = LumiereGold,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }

                                val year = title.year
                                if (year != null && year > 0) {
                                    Text(
                                        text = "· 📅 $year",
                                        fontSize = 13.sp,
                                        color = TextSecondary
                                    )
                                }

                                val runtime = title.runtime
                                if (!runtime.isNullOrBlank()) {
                                    Text(
                                        text = "· ⏱ $runtime",
                                        fontSize = 13.sp,
                                        color = TextSecondary
                                    )
                                }

                                val ageRating = title.rating
                                if (!ageRating.isNullOrBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0x22FFFFFF))
                                            .border(1.dp, Color(0x44FFFFFF), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = ageRating,
                                            color = TextSecondary,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            // Action Buttons Row (Single Row fitting all 6 buttons seamlessly)
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp)
                            ) {
                                val actionPillShape = RoundedCornerShape(32.dp)
                                val actionCircleShape = RoundedCornerShape(26.dp)

                                // 1. Play Button (Primary)
                                Button(
                                    onClick = {
                                        viewModel.playResumeOrOpenDialog { streamUrl, playTitle, subtitle, isHls ->
                                            val startPos = (state.savedProgressSec * 1000L).coerceAtLeast(0L)
                                            val sNum = if (mediaType == "tv") state.selectedSeason else 0
                                            val eNum = if (mediaType == "tv") (state.lastWatchedEpisodeNum ?: 1) else 0
                                            onPlayRequested(streamUrl, playTitle, subtitle, isHls, startPos, title.poster.orEmpty(), sNum, eNum)
                                        }
                                    },
                                    modifier = Modifier
                                        .focusRequester(watchFocusRequester)
                                        .then(actionDownModifier),
                                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                    colors = ButtonDefaults.colors(
                                        containerColor = Color.White,
                                        contentColor = Color(0xFF0B0C10),
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = ButtonDefaults.border(
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionPillShape),
                                        border = Border.None
                                    ),
                                    shape = ButtonDefaults.shape(actionPillShape),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 7.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        modifier = Modifier.size(17.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
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
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                // 2. Watchlist ("Буду смотреть")
                                OutlinedButton(
                                    onClick = { viewModel.toggleWatchlist() },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .then(actionDownModifier),
                                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.08f),
                                    colors = OutlinedButtonDefaults.colors(
                                        containerColor = if (state.isInWatchlist) Color(0x33E5A93C) else Color(0x20FFFFFF),
                                        contentColor = if (state.isInWatchlist) LumiereGold else TextPrimary,
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = OutlinedButtonDefaults.border(
                                        border = Border(border = BorderStroke(1.dp, if (state.isInWatchlist) LumiereGold else Color(0x40FFFFFF)), shape = actionCircleShape),
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionCircleShape)
                                    ),
                                    shape = OutlinedButtonDefaults.shape(actionCircleShape),
                                    contentPadding = PaddingValues(0.dp)
                                ) {
                                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = if (state.isInWatchlist) Icons.Default.Check else Icons.Default.Add,
                                            contentDescription = "Буду смотреть",
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                // 3. Favorites ("В закладки / Нравится")
                                OutlinedButton(
                                    onClick = { viewModel.toggleFavorite() },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .then(actionDownModifier),
                                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.08f),
                                    colors = OutlinedButtonDefaults.colors(
                                        containerColor = if (state.isFavorite) Color(0x33FF4081) else Color(0x20FFFFFF),
                                        contentColor = if (state.isFavorite) Color(0xFFFF5252) else TextPrimary,
                                        focusedContainerColor = Color(0xFFFF5252),
                                        focusedContentColor = Color.White
                                    ),
                                    border = OutlinedButtonDefaults.border(
                                        border = Border(border = BorderStroke(1.dp, if (state.isFavorite) Color(0x88FF4081) else Color(0x40FFFFFF)), shape = actionCircleShape),
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionCircleShape)
                                    ),
                                    shape = OutlinedButtonDefaults.shape(actionCircleShape),
                                    contentPadding = PaddingValues(0.dp)
                                ) {
                                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = if (state.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                            contentDescription = "В закладки",
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                // 4. Notifications Bell ("Следить")
                                OutlinedButton(
                                    onClick = { viewModel.toggleNotificationSubscription() },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .then(actionDownModifier),
                                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.08f),
                                    colors = OutlinedButtonDefaults.colors(
                                        containerColor = if (state.isSubscribed) Color(0x33E5A93C) else Color(0x20FFFFFF),
                                        contentColor = if (state.isSubscribed) LumiereGold else TextPrimary,
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = OutlinedButtonDefaults.border(
                                        border = Border(border = BorderStroke(1.dp, if (state.isSubscribed) LumiereGold else Color(0x40FFFFFF)), shape = actionCircleShape),
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionCircleShape)
                                    ),
                                    shape = OutlinedButtonDefaults.shape(actionCircleShape),
                                    contentPadding = PaddingValues(0.dp)
                                ) {
                                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = if (state.isSubscribed) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                                            contentDescription = "Следить за новыми сериями или релизом",
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                // 5. Trailer button
                                OutlinedButton(
                                    onClick = {
                                        viewModel.playTrailer { trailerUrl ->
                                            onPlayRequested(trailerUrl, "${title.name} (Трейлер)", "", trailerUrl.contains(".m3u8"), 0L, "", 0, 0)
                                        }
                                    },
                                    modifier = Modifier.then(actionDownModifier),
                                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                    colors = OutlinedButtonDefaults.colors(
                                        containerColor = Color(0x20FFFFFF),
                                        focusedContainerColor = Color(0x40FFFFFF),
                                        focusedContentColor = TextPrimary
                                    ),
                                    border = OutlinedButtonDefaults.border(
                                        border = Border(border = BorderStroke(1.dp, Color(0x40FFFFFF)), shape = actionPillShape),
                                        focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = actionPillShape)
                                    ),
                                    shape = OutlinedButtonDefaults.shape(actionPillShape),
                                    contentPadding = PaddingValues(horizontal = 11.dp, vertical = 7.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Movie,
                                        contentDescription = null,
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Трейлер", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                                }

                                // 6. All Torrents Modal Button ("Все раздачи")
                                OutlinedButton(
                                    onClick = { viewModel.openTorrentDialog() },
                                    modifier = Modifier.then(actionDownModifier),
                                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                    colors = OutlinedButtonDefaults.colors(
                                        containerColor = Color(0x20FFFFFF),
                                        focusedContainerColor = Color(0x40FFFFFF),
                                        focusedContentColor = TextPrimary
                                    ),
                                    border = OutlinedButtonDefaults.border(
                                        border = Border(border = BorderStroke(1.dp, Color(0x40FFFFFF)), shape = actionPillShape),
                                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionPillShape)
                                    ),
                                    shape = OutlinedButtonDefaults.shape(actionPillShape),
                                    contentPadding = PaddingValues(horizontal = 11.dp, vertical = 7.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Download,
                                        contentDescription = null,
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    val torrentCount = state.torrents.size
                                    Text(
                                        text = if (torrentCount > 0) "Все раздачи ($torrentCount)" else "Все раздачи",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            // Synopsis (Full text without truncation)
                            val overview = title.overview ?: title.description
                            if (!overview.isNullOrBlank()) {
                                Text(
                                    text = overview,
                                    fontSize = 13.5.sp,
                                    lineHeight = 19.5.sp,
                                    color = TextSecondary
                                )
                            }

                            // "О фильме" / "О сериале" Specs Block
                            DetailSpecsBlock(title = title)
                        }

                        // Right Hero: 4x2 Actor Cards Grid
                        Column(
                            modifier = Modifier.width(320.dp)
                        ) {
                            if (title.cast.isNotEmpty()) {
                                CastSectionWgt(
                                    cast = title.cast,
                                    resolveImageUrl = { viewModel.resolveImageUrl(it) },
                                    onActorClick = { personId, personName ->
                                        onActorClick?.invoke(personId, personName)
                                    },
                                    onOpenAllCast = {
                                        showAllCastDialog = true
                                    },
                                    bottomFocusRequester = bottomSectionFocusRequester
                                )
                            }
                        }
                    }
                }

                // Streaming Section: Episodes (TV) & Torrents (TV & Movie)
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

                            if (isTv) {
                                val isEpisodesTab = seriesTab == "episodes"
                                Button(
                                    onClick = { viewModel.setSeriesTab("episodes") },
                                    modifier = Modifier
                                        .focusRequester(episodesTabFocusRequester)
                                        .focusProperties { up = watchFocusRequester }
                                        .onKeyEvent { event ->
                                            if (event.type == KeyEventType.KeyDown &&
                                                event.nativeKeyEvent.keyCode == android.view.KeyEvent.KEYCODE_DPAD_UP
                                            ) {
                                                try {
                                                    watchFocusRequester.requestFocus()
                                                } catch (_: Exception) {
                                                    coroutineScope.launch {
                                                        try {
                                                            listState.animateScrollToItem(1)
                                                            kotlinx.coroutines.delay(50)
                                                            watchFocusRequester.requestFocus()
                                                        } catch (_: Exception) {}
                                                    }
                                                }
                                                true
                                            } else {
                                                false
                                            }
                                        },
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
                            }

                            val isTorrentsTab = !isTv || seriesTab == "torrents"
                            Button(
                                onClick = { if (isTv) viewModel.setSeriesTab("torrents") },
                                modifier = Modifier
                                    .focusRequester(torrentsTabFocusRequester)
                                    .focusProperties { up = watchFocusRequester }
                                    .onKeyEvent { event ->
                                        if (event.type == KeyEventType.KeyDown &&
                                            event.nativeKeyEvent.keyCode == android.view.KeyEvent.KEYCODE_DPAD_UP
                                        ) {
                                            try {
                                                watchFocusRequester.requestFocus()
                                            } catch (_: Exception) {
                                                coroutineScope.launch {
                                                    try {
                                                        listState.animateScrollToItem(1)
                                                        kotlinx.coroutines.delay(50)
                                                        watchFocusRequester.requestFocus()
                                                    } catch (_: Exception) {}
                                                }
                                            }
                                            true
                                        } else {
                                            false
                                        }
                                    },
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
                                val seasonTorrentCount = remember(state.torrents, state.selectedSeason) {
                                    if (isTv && state.selectedSeason > 0) {
                                        state.torrents.count { TorrentMetaParser.matchesTorrentSeason(it.title, state.selectedSeason, title.year) }
                                    } else {
                                        state.torrents.size
                                    }
                                }
                                Text(
                                    text = if (seasonTorrentCount > 0) "Торренты ($seasonTorrentCount)" else if (state.torrents.isNotEmpty()) "Торренты (${state.torrents.size})" else "Торренты",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = if (isTorrentsTab) FontWeight.Bold else FontWeight.Medium
                                )
                            }
                        }


                        if (isTv && seriesTab == "episodes") {
                                SeasonPicker(
                                    seasonsCount = maxOf(title.seasonsCount ?: 1, state.selectedSeason),
                                    selectedSeason = state.selectedSeason,
                                    onSeasonSelect = { viewModel.selectSeason(it) },
                                    episodes = state.episodes,
                                    isLoadingEpisodes = state.isLoadingEpisodes,
                                    resolveImageUrl = { viewModel.resolveImageUrl(it) },
                                    lastWatchedSeason = state.lastWatchedSeason,
                                    lastWatchedEpisodeNum = state.lastWatchedEpisodeNum,
                                    watchedEpisodes = state.watchedEpisodes,
                                    episodeProgress = state.episodeProgress,
                                    fallbackPosterUrl = title.backdrop.orEmpty().ifBlank { title.poster.orEmpty() },
                                    onEpisodeClick = { ep ->
                                        viewModel.playEpisodeDirectly(ep) { streamUrl, epTitle, subtitle, isHls ->
                                            val epKey = "${ep.season}_${ep.episode}"
                                            val isWatched = state.watchedEpisodes.contains(epKey)
                                            val startPos = if (isWatched) {
                                                0L
                                            } else if (state.selectedSeason == ep.season && state.lastWatchedEpisodeNum == ep.episode) {
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
                                val hasPreferredVoiceover = remember(state.torrents) { state.torrents.any { it.isPreferredVoiceover } }
                                val qualityOptions = remember(hasPreferredVoiceover) {
                                    val list = mutableListOf("all" to "Все")
                                    if (hasPreferredVoiceover) {
                                        list.add("preferred" to "⭐ Любимая")
                                    }
                                    list.add("4k" to "4K")
                                    list.add("1080p" to "1080p")
                                    list.add("720p" to "720p")
                                    list
                                }

                                val filteredTorrents = remember(state.torrents, qualityFilter, sortBy, state.selectedSeason) {
                                    val seasonList = if (mediaType == "tv" && state.selectedSeason > 0) {
                                        val filtered = state.torrents.filter { item ->
                                            TorrentMetaParser.matchesTorrentSeason(item.title, state.selectedSeason, title.year)
                                        }
                                        filtered.ifEmpty { state.torrents }
                                    } else {
                                        state.torrents
                                    }

                                    var list = seasonList.filter { item ->
                                        val meta = TorrentMetaParser.parse(item.title, item.audio, item.quality)
                                        when (qualityFilter) {
                                            "preferred" -> item.isPreferredVoiceover
                                            "4k" -> meta.resolution == "4K UHD"
                                            "1080p" -> meta.resolution == "1080p"
                                            "720p" -> meta.resolution == "720p"
                                            else -> true
                                        }
                                    }
                                    if (list.isEmpty() && seasonList.isNotEmpty()) {
                                        list = seasonList
                                    }
                                    when (sortBy) {
                                        "seeds" -> list.sortedByDescending { it.seeders ?: 0 }
                                        "size" -> list.sortedByDescending { TorrentMetaParser.parseSizeBytes(it) }
                                        "date" -> list.sortedWith(
                                            compareByDescending<com.lumiere.core.model.TorrentItem> { TorrentMetaParser.parseTorrentDate(it.date) }
                                                .thenByDescending { it.seeders ?: 0 }
                                        )
                                        else -> list.sortedByDescending { item ->
                                            val tLower = item.title.lowercase()
                                            val isLegacy = tLower.contains("xvid") || tLower.contains(".avi") || tLower.contains("dlrip") ||
                                                           tLower.contains("web-dlrip") || tLower.contains("dvdrip") || tLower.contains("satrip") ||
                                                           tLower.contains("bdrip") || (tLower.contains("avi") && !tLower.contains("davinci"))
                                            val isHd = (tLower.contains("1080") || tLower.contains("720") || tLower.contains("2160") ||
                                                       tLower.contains("4k") || tLower.contains("mkv") || tLower.contains("h.264") ||
                                                       tLower.contains("x264") || tLower.contains("hevc") || tLower.contains("h.265")) && !isLegacy
                                            val prefBonus = if (item.isPreferredVoiceover) 3000 else 0
                                            (item.seeders ?: 0) * 10 + (if (isHd) 500 else 0) - (if (isLegacy) 500 else 0) + prefBonus
                                        }
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
                                                qualityOptions.forEach { (id, label) ->
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

        // All Cast Modal Dialog (matching WGT #all-cast-modal)
        if (showAllCastDialog && title != null) {
            AllCastDialog(
                cast = title.cast,
                resolveImageUrl = { viewModel.resolveImageUrl(it) },
                onActorClick = { personId, personName ->
                    showAllCastDialog = false
                    onActorClick?.invoke(personId, personName)
                },
                onDismiss = { showAllCastDialog = false }
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
                                if (torrent.isPreferredVoiceover) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(5.dp))
                                            .background(Color(0x33E5A93C))
                                            .border(1.dp, LumiereGold, RoundedCornerShape(5.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "⭐ ЛЮБИМАЯ ОЗВУЧКА",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = LumiereGold
                                        )
                                    }
                                }

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

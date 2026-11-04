package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.Episode
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SeasonPicker(
    seasonsCount: Int,
    selectedSeason: Int,
    onSeasonSelect: (Int) -> Unit,
    episodes: List<Episode>,
    resolveImageUrl: (String?) -> String,
    onEpisodeClick: (Episode) -> Unit,
    isLoadingEpisodes: Boolean = false,
    lastWatchedSeason: Int? = null,
    lastWatchedEpisodeNum: Int? = null,
    watchedEpisodes: Set<String> = emptySet(),
    episodeProgress: Map<String, Float> = emptyMap(),
    fallbackPosterUrl: String? = null,
    modifier: Modifier = Modifier
) {
    val episodesListState = androidx.compose.foundation.lazy.rememberLazyListState()

    androidx.compose.runtime.LaunchedEffect(selectedSeason) {
        try {
            episodesListState.scrollToItem(0)
        } catch (_: Exception) {}
    }

    val isViewingWatchedSeason = lastWatchedSeason != null && selectedSeason == lastWatchedSeason

    androidx.compose.runtime.LaunchedEffect(episodes, lastWatchedEpisodeNum, isViewingWatchedSeason) {
        if (episodes.isNotEmpty() && lastWatchedEpisodeNum != null && isViewingWatchedSeason) {
            val targetIdx = episodes.indexOfFirst { it.episode == lastWatchedEpisodeNum }
            if (targetIdx >= 0) {
                try {
                    episodesListState.animateScrollToItem(targetIdx)
                } catch (_: Exception) {}
            }
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Season Tabs Row
        if (seasonsCount > 1) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items((1..seasonsCount).toList()) { seasonNum ->
                    val isSelected = seasonNum == selectedSeason
                    val tabShape = RoundedCornerShape(12.dp)
                    Button(
                        onClick = { onSeasonSelect(seasonNum) },
                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                        colors = ButtonDefaults.colors(
                            containerColor = if (isSelected) LumiereGold else Color(0x18FFFFFF),
                            contentColor = if (isSelected) BackgroundDark else TextPrimary,
                            focusedContainerColor = if (isSelected) LumiereGold else Color(0x33FFFFFF),
                            focusedContentColor = if (isSelected) BackgroundDark else Color.White
                        ),
                        border = ButtonDefaults.border(
                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = tabShape),
                            border = Border(
                                border = BorderStroke(
                                    width = if (isSelected) 1.5.dp else 1.dp,
                                    color = if (isSelected) LumiereGold else Color(0x22FFFFFF)
                                ),
                                shape = tabShape
                            )
                        ),
                        shape = ButtonDefaults.shape(tabShape),
                        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            if (isSelected) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(RoundedCornerShape(3.dp))
                                        .background(BackgroundDark)
                                )
                            }
                            Text(
                                text = "Сезон $seasonNum",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium
                            )
                        }
                    }
                }
            }
        }

        // Episodes Horizontal Carousel or Loading State
        if (isLoadingEpisodes) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    androidx.compose.material3.CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = LumiereGold,
                        strokeWidth = 2.5.dp
                    )
                    Text(
                        text = "Загрузка серий $selectedSeason сезона...",
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary
                    )
                }
            }
        } else if (episodes.isNotEmpty()) {
            LazyRow(
                state = episodesListState,
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(episodes, key = { it.id ?: "${it.season}-${it.episode}" }) { ep ->
                    val epThumb = ep.thumbnail.orEmpty().ifBlank { fallbackPosterUrl.orEmpty() }
                    val epTag = "${ep.season}_${ep.episode}"
                    val isWatched = watchedEpisodes.contains(epTag)
                    val progress = episodeProgress[epTag] ?: 0f
                    val isLastWatched = isViewingWatchedSeason && (ep.episode == lastWatchedEpisodeNum)
                    EpisodeCard(
                        episode = ep,
                        thumbnailUrl = resolveImageUrl(epThumb),
                        isWatched = isWatched,
                        progress = progress,
                        isLastWatched = isLastWatched && !isWatched,
                        onClick = { onEpisodeClick(ep) }
                    )
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Серии для $selectedSeason сезона пока не найдены",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EpisodeCard(
    episode: Episode,
    thumbnailUrl: String,
    isWatched: Boolean = false,
    progress: Float = 0f,
    isLastWatched: Boolean = false,
    onClick: () -> Unit
) {
    val interactionSource = androidx.compose.runtime.remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Card(
        onClick = onClick,
        interactionSource = interactionSource,
        modifier = Modifier
            .width(240.dp)
            .height(180.dp)
            .zIndex(if (isFocused) 10f else 0f),
        colors = CardDefaults.colors(
            containerColor = SurfaceDark,
            focusedContainerColor = SurfaceVariantDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(3.dp, LumiereGold),
                shape = RoundedCornerShape(16.dp)
            ),
            border = Border(
                border = BorderStroke(
                    width = if (isLastWatched) 1.5.dp else 1.dp,
                    color = if (isLastWatched) LumiereGold.copy(alpha = 0.8f) else if (isWatched) Color(0xFF10B981).copy(alpha = 0.5f) else SurfaceBorder
                ),
                shape = RoundedCornerShape(16.dp)
            )
        ),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1.08f, pressedScale = 1.02f),
        glow = CardDefaults.glow(
            focusedGlow = Glow(
                elevationColor = Color(0x66E5A93C),
                elevation = 16.dp
            )
        ),
        shape = CardDefaults.shape(RoundedCornerShape(16.dp))
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Episode Thumbnail (16:9)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .background(Color(0xFF1E293B)),
                contentAlignment = Alignment.Center
            ) {
                if (thumbnailUrl.isNotBlank()) {
                    AsyncImage(
                        model = thumbnailUrl,
                        contentDescription = episode.title,
                        contentScale = ContentScale.Crop,
                        alpha = if (isWatched) 0.65f else 1.0f,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Text(
                        text = "▶ Серия ${episode.episode}",
                        fontSize = 14.sp,
                        color = LumiereGold,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Episode Number Badge
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(6.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xD907090E))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "С${episode.season} · Э${episode.episode}",
                        fontSize = 11.sp,
                        color = LumiereGold,
                        fontWeight = FontWeight.Bold
                    )
                }

                val today = remember {
                    try {
                        java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
                    } catch (_: Exception) { "" }
                }
                val airedStr = episode.aired
                val isNotAired = episode.isAired == false || (
                    !airedStr.isNullOrBlank() &&
                    airedStr != "—" &&
                    airedStr.take(10).matches(Regex("""\d{4}-\d{2}-\d{2}""")) &&
                    today.isNotBlank() &&
                    airedStr.take(10) > today
                )

                // Top-End Badge: Watched (Green), Not Aired (Red) or Last Watched (Gold)
                if (isWatched) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(6.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFF10B981))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "✔ Просмотрено",
                            fontSize = 10.sp,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else if (isNotAired) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(6.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xE6E11D48))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        val badgeText = if (!airedStr.isNullOrBlank() && airedStr != "—") {
                            val parts = airedStr.take(10).split("-")
                            if (parts.size == 3) "Не вышла · ${parts[2]}.${parts[1]}.${parts[0]}" else "Не вышла"
                        } else {
                            "Не вышла"
                        }
                        Text(
                            text = badgeText,
                            fontSize = 10.sp,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else if (isLastWatched) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(6.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(LumiereGold)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "Вы смотрели",
                            fontSize = 10.sp,
                            color = BackgroundDark,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Progress bar at the bottom of the thumbnail for partially watched episodes (> 3%)
                if (!isWatched && progress > 0.03f) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .height(3.5.dp)
                            .background(Color(0x80000000))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(fraction = progress.coerceIn(0f, 1f))
                                .background(LumiereGold)
                        )
                    }
                }
            }

            // Title and Details
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(8.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = episode.title ?: "Сезон ${episode.season} · Серия ${episode.episode}",
                    style = MaterialTheme.typography.titleMedium,
                    color = TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                val synopsis = episode.synopsis
                if (!synopsis.isNullOrBlank()) {
                    Text(
                        text = synopsis,
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 14.sp
                    )
                }
            }
        }
    }
}

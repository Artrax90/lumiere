package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    lastWatchedEpisodeNum: Int? = null,
    modifier: Modifier = Modifier
) {
    val episodesListState = androidx.compose.foundation.lazy.rememberLazyListState()

    androidx.compose.runtime.LaunchedEffect(episodes, lastWatchedEpisodeNum) {
        if (episodes.isNotEmpty() && lastWatchedEpisodeNum != null) {
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
                    val tabShape = RoundedCornerShape(10.dp)
                    Button(
                        onClick = { onSeasonSelect(seasonNum) },
                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                        colors = ButtonDefaults.colors(
                            containerColor = if (isSelected) LumiereGold else SurfaceDark,
                            contentColor = if (isSelected) BackgroundDark else TextSecondary,
                            focusedContainerColor = Color.White,
                            focusedContentColor = BackgroundDark
                        ),
                        border = ButtonDefaults.border(
                            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = tabShape),
                            border = if (isSelected) Border(border = BorderStroke(1.dp, LumiereGold), shape = tabShape) else Border.None
                        ),
                        shape = ButtonDefaults.shape(tabShape),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = "Сезон $seasonNum",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }
            }
        }

        // Episodes Horizontal Carousel
        if (episodes.isNotEmpty()) {
            LazyRow(
                state = episodesListState,
                contentPadding = PaddingValues(horizontal = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(episodes, key = { it.id ?: "${it.season}-${it.episode}" }) { ep ->
                    EpisodeCard(
                        episode = ep,
                        thumbnailUrl = resolveImageUrl(ep.thumbnail),
                        isLastWatched = ep.episode == lastWatchedEpisodeNum,
                        onClick = { onEpisodeClick(ep) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EpisodeCard(
    episode: Episode,
    thumbnailUrl: String,
    isLastWatched: Boolean = false,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .width(240.dp)
            .height(180.dp),
        colors = CardDefaults.colors(
            containerColor = SurfaceDark,
            focusedContainerColor = SurfaceVariantDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.5.dp, LumiereGold),
                shape = RoundedCornerShape(14.dp)
            ),
            border = Border(
                border = BorderStroke(
                    width = if (isLastWatched) 1.5.dp else 1.dp,
                    color = if (isLastWatched) LumiereGold.copy(alpha = 0.8f) else SurfaceBorder
                ),
                shape = RoundedCornerShape(14.dp)
            )
        ),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1f),
        shape = CardDefaults.shape(RoundedCornerShape(14.dp))
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Episode Thumbnail (16:9)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
            ) {
                AsyncImage(
                    model = thumbnailUrl,
                    contentDescription = episode.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

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
                        text = "Серия ${episode.episode}",
                        fontSize = 11.sp,
                        color = LumiereGold,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Last Watched badge
                if (isLastWatched) {
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
            }

            // Title and Details
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(8.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = episode.title ?: "Серия ${episode.episode}",
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

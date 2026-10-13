package com.lumiere.tv.ui.details

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.SeasonPicker
import com.lumiere.tv.ui.components.TorrentDialog

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DetailsScreen(
    mediaId: Long,
    mediaType: String,
    onBackClick: () -> Unit,
    onPlayRequested: (streamUrl: String, title: String, subtitle: String, isHls: Boolean) -> Unit,
    viewModel: DetailsViewModel
) {
    val state by viewModel.uiState.collectAsState()
    val title = state.title

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
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 48.dp, vertical = 28.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                // Top Navigation Bar (Back Button)
                item {
                    OutlinedButton(
                        onClick = onBackClick,
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
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

                            Spacer(modifier = Modifier.height(8.dp))

                            // Action Buttons
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Button(
                                    onClick = { viewModel.openTorrentDialog() },
                                    colors = ButtonDefaults.colors(
                                        containerColor = LumiereGold,
                                        contentColor = BackgroundDark,
                                        focusedContainerColor = Color.White,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    shape = ButtonDefaults.shape(RoundedCornerShape(12.dp))
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = if (state.isStartingStream) "Запуск..." else "Смотреть (Торренты)",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                OutlinedButton(
                                    onClick = { viewModel.openTorrentDialog() },
                                    colors = OutlinedButtonDefaults.colors(
                                        focusedContainerColor = Color(0x22FFFFFF),
                                        focusedContentColor = TextPrimary
                                    ),
                                    shape = OutlinedButtonDefaults.shape(RoundedCornerShape(12.dp))
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Download,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Выбрать качество (${state.torrents.size})",
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
                            }
                        }
                    }
                }

                // If TV Series: Seasons and Episodes Row
                if (mediaType == "tv") {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text(
                                text = "Сезоны и серии",
                                style = MaterialTheme.typography.headlineMedium,
                                color = TextPrimary
                            )

                            SeasonPicker(
                                seasonsCount = title.seasonsCount ?: 1,
                                selectedSeason = state.selectedSeason,
                                onSeasonSelect = { viewModel.selectSeason(it) },
                                episodes = state.episodes,
                                resolveImageUrl = { viewModel.resolveImageUrl(it) },
                                onEpisodeClick = { ep ->
                                    viewModel.openTorrentDialog(ep)
                                }
                            )
                        }
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
                onTorrentSelected = { torrent ->
                    viewModel.playTorrent(torrent, onPlayRequested)
                },
                onDismiss = { viewModel.dismissTorrentDialog() }
            )
        }
    }
}

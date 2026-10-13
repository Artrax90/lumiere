package com.lumiere.tv.ui.player

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.*
import com.lumiere.core.player.TrackInfo
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PlayerControlsOverlay(
    isVisible: Boolean,
    title: String,
    subtitle: String,
    isPlaying: Boolean,
    isBuffering: Boolean,
    positionMs: Long,
    durationMs: Long,
    bufferedMs: Long,
    torrServerStats: String?,
    audioTracks: List<TrackInfo>,
    subtitleTracks: List<TrackInfo>,
    onPlayPauseClick: () -> Unit,
    onSeekRelative: (Long) -> Unit,
    onAudioTrackSelect: (Int) -> Unit,
    onSubtitleTrackSelect: (Int) -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showAudioDialog by remember { mutableStateOf(false) }
    var showSubtitleDialog by remember { mutableStateOf(false) }

    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier.fillMaxSize()
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xCC07090E),
                            Color.Transparent,
                            Color(0xEE07090E)
                        )
                    )
                )
        ) {
            // Top Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    OutlinedButton(
                        onClick = onBackClick,
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        shape = OutlinedButtonDefaults.shape(CircleShape),
                        contentPadding = PaddingValues(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Назад",
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Column {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            color = TextPrimary
                        )
                        if (subtitle.isNotBlank()) {
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.labelMedium,
                                color = TextSecondary
                            )
                        }
                    }
                }
            }

            // TorrServer Buffer Banner (Top-Right or Center)
            if (!torrServerStats.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 36.dp, end = 32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xD907090E))
                        .border(1.dp, LumiereGoldGlow, RoundedCornerShape(8.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = torrServerStats,
                        fontSize = 12.sp,
                        color = LumiereGold,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Bottom Bar Controls
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 36.dp, vertical = 28.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Time & Progress Bar
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = formatTime(positionMs),
                            style = MaterialTheme.typography.labelMedium,
                            color = TextPrimary
                        )
                        Text(
                            text = formatTime(durationMs),
                            style = MaterialTheme.typography.labelMedium,
                            color = TextSecondary
                        )
                    }

                    // Progress Track
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color(0x33FFFFFF))
                    ) {
                        val dur = durationMs.coerceAtLeast(1L).toFloat()
                        val bufferedFraction = (bufferedMs.toFloat() / dur).coerceIn(0f, 1f)
                        val progressFraction = (positionMs.toFloat() / dur).coerceIn(0f, 1f)

                        // Buffered bar
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(bufferedFraction)
                                .fillMaxHeight()
                                .background(Color(0x55FFFFFF))
                        )
                        // Played bar
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progressFraction)
                                .fillMaxHeight()
                                .background(LumiereGold)
                        )
                    }
                }

                // Control Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Playback actions
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Button(
                            onClick = { onSeekRelative(-10000L) },
                            colors = ButtonDefaults.colors(
                                containerColor = SurfaceVariantDark,
                                contentColor = TextPrimary,
                                focusedContainerColor = LumiereGold,
                                focusedContentColor = BackgroundDark
                            ),
                            shape = ButtonDefaults.shape(CircleShape),
                            contentPadding = PaddingValues(10.dp)
                        ) {
                            Icon(Icons.Default.Replay10, contentDescription = "-10с")
                        }

                        Button(
                            onClick = onPlayPauseClick,
                            colors = ButtonDefaults.colors(
                                containerColor = LumiereGold,
                                contentColor = BackgroundDark,
                                focusedContainerColor = Color.White,
                                focusedContentColor = BackgroundDark
                            ),
                            shape = ButtonDefaults.shape(CircleShape),
                            contentPadding = PaddingValues(14.dp)
                        ) {
                            Icon(
                                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (isPlaying) "Пауза" else "Играть",
                                modifier = Modifier.size(28.dp)
                            )
                        }

                        Button(
                            onClick = { onSeekRelative(10000L) },
                            colors = ButtonDefaults.colors(
                                containerColor = SurfaceVariantDark,
                                contentColor = TextPrimary,
                                focusedContainerColor = LumiereGold,
                                focusedContentColor = BackgroundDark
                            ),
                            shape = ButtonDefaults.shape(CircleShape),
                            contentPadding = PaddingValues(10.dp)
                        ) {
                            Icon(Icons.Default.Forward10, contentDescription = "+10с")
                        }
                    }

                    // Track & Subtitle Switchers
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (audioTracks.isNotEmpty()) {
                            Button(
                                onClick = { showAudioDialog = true },
                                colors = ButtonDefaults.colors(
                                    containerColor = SurfaceVariantDark,
                                    contentColor = TextPrimary,
                                    focusedContainerColor = LumiereGold,
                                    focusedContentColor = BackgroundDark
                                ),
                                shape = ButtonDefaults.shape(RoundedCornerShape(10.dp))
                            ) {
                                Icon(Icons.Default.Audiotrack, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Аудио", style = MaterialTheme.typography.labelMedium)
                            }
                        }

                        if (subtitleTracks.isNotEmpty()) {
                            Button(
                                onClick = { showSubtitleDialog = true },
                                colors = ButtonDefaults.colors(
                                    containerColor = SurfaceVariantDark,
                                    contentColor = TextPrimary,
                                    focusedContainerColor = LumiereGold,
                                    focusedContentColor = BackgroundDark
                                ),
                                shape = ButtonDefaults.shape(RoundedCornerShape(10.dp))
                            ) {
                                Icon(Icons.Default.Subtitles, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Субтитры", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }
        }
    }

    // Audio Track Picker Dialog
    if (showAudioDialog) {
        TrackPickerDialog(
            title = "Аудиодорожки",
            tracks = audioTracks,
            onSelect = { idx ->
                onAudioTrackSelect(idx)
                showAudioDialog = false
            },
            onDismiss = { showAudioDialog = false }
        )
    }

    // Subtitle Track Picker Dialog
    if (showSubtitleDialog) {
        TrackPickerDialog(
            title = "Субтитры",
            tracks = subtitleTracks,
            allowNone = true,
            onSelect = { idx ->
                onSubtitleTrackSelect(idx)
                showSubtitleDialog = false
            },
            onDismiss = { showSubtitleDialog = false }
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TrackPickerDialog(
    title: String,
    tracks: List<TrackInfo>,
    allowNone: Boolean = false,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(420.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(SurfaceDark)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                .padding(24.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )

                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (allowNone) {
                        item {
                            Button(
                                onClick = { onSelect(-1) },
                                colors = ButtonDefaults.colors(
                                    containerColor = SurfaceVariantDark,
                                    contentColor = TextPrimary,
                                    focusedContainerColor = LumiereGold,
                                    focusedContentColor = BackgroundDark
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Выключить")
                            }
                        }
                    }

                    itemsIndexed(tracks) { index, track ->
                        Button(
                            onClick = { onSelect(index) },
                            colors = ButtonDefaults.colors(
                                containerColor = if (track.isSelected) LumiereGoldVariant else SurfaceVariantDark,
                                contentColor = if (track.isSelected) BackgroundDark else TextPrimary,
                                focusedContainerColor = LumiereGold,
                                focusedContentColor = BackgroundDark
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(track.name)
                        }
                    }
                }
            }
        }
    }
}

private fun formatTime(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0L)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) {
        String.format("%d:%02d:%02d", h, m, s)
    } else {
        String.format("%02d:%02d", m, s)
    }
}

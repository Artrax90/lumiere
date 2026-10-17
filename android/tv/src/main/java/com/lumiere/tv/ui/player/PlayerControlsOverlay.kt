package com.lumiere.tv.ui.player

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.tv.material3.*
import com.lumiere.core.player.TrackInfo
import com.lumiere.tv.theme.*

enum class PlayerZone {
    TIMELINE,
    BOTTOM,
    TOP
}

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
    activeZone: PlayerZone,
    bottomBtnIndex: Int,
    popupType: String?,
    popupIndex: Int,
    onPlayPauseClick: () -> Unit,
    onSeekRelative: (Long) -> Unit,
    onAudioTrackSelect: (Int) -> Unit,
    onSubtitleTrackSelect: (Int) -> Unit,
    onOpenAudioPopup: () -> Unit,
    onOpenSubtitlePopup: () -> Unit,
    onClosePopup: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val hasAudio = audioTracks.isNotEmpty()
    val hasSubs = subtitleTracks.isNotEmpty()
    val audioBtnIndex = if (hasAudio) 3 else -1
    val subBtnIndex = if (hasSubs) (if (hasAudio) 4 else 3) else -1

    if (isVisible) {
        Box(
            modifier = modifier.fillMaxSize()
        ) {
            // Top Bar Background Gradient
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color(0xD907090E), Color.Transparent)
                        )
                    )
            )

            // Bottom Bar Background Gradient
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, Color(0xF207090E))
                        )
                    )
            )
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
                    val isBackFocused = activeZone == PlayerZone.TOP
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (isBackFocused) LumiereGold else Color(0x33FFFFFF))
                            .border(
                                width = if (isBackFocused) 2.5.dp else 1.dp,
                                color = if (isBackFocused) Color.White else Color(0x44FFFFFF),
                                shape = CircleShape
                            )
                            .clickable { onBackClick() }
                            .padding(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Назад",
                            tint = if (isBackFocused) BackgroundDark else TextPrimary,
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

            // TorrServer Buffer Banner (Top-Right)
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
                val isTimelineFocused = activeZone == PlayerZone.TIMELINE
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = formatTime(positionMs),
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isTimelineFocused) LumiereGold else TextPrimary,
                                fontWeight = if (isTimelineFocused) FontWeight.Bold else FontWeight.Normal
                            )
                            if (isTimelineFocused) {
                                Text(
                                    text = "◀ Перемотка ▶",
                                    fontSize = 12.sp,
                                    color = LumiereGold,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
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
                            .height(if (isTimelineFocused) 8.dp else 6.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0x33FFFFFF))
                            .then(
                                if (isTimelineFocused) Modifier.border(1.dp, LumiereGoldGlow, RoundedCornerShape(4.dp))
                                else Modifier
                            )
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
                        // Rewind 10s (Button 0)
                        val isBtn0Focused = activeZone == PlayerZone.BOTTOM && bottomBtnIndex == 0
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (isBtn0Focused) LumiereGold else SurfaceVariantDark)
                                .border(
                                    width = if (isBtn0Focused) 2.5.dp else 1.dp,
                                    color = if (isBtn0Focused) Color.White else SurfaceBorder,
                                    shape = CircleShape
                                )
                                .clickable { onSeekRelative(-10000L) }
                                .padding(10.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Replay10,
                                contentDescription = "-10с",
                                tint = if (isBtn0Focused) BackgroundDark else TextPrimary,
                                modifier = Modifier.size(22.dp)
                            )
                        }

                        // Play/Pause (Button 1)
                        val isBtn1Focused = activeZone == PlayerZone.BOTTOM && bottomBtnIndex == 1
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (isBtn1Focused) Color.White else Color(0x33FFFFFF))
                                .border(
                                    width = if (isBtn1Focused) 3.dp else 1.dp,
                                    color = if (isBtn1Focused) LumiereGold else SurfaceBorder,
                                    shape = CircleShape
                                )
                                .clickable { onPlayPauseClick() }
                                .padding(14.dp)
                        ) {
                            Icon(
                                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (isPlaying) "Пауза" else "Играть",
                                tint = if (isBtn1Focused) BackgroundDark else Color.White,
                                modifier = Modifier.size(28.dp)
                            )
                        }

                        // Forward 10s (Button 2)
                        val isBtn2Focused = activeZone == PlayerZone.BOTTOM && bottomBtnIndex == 2
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (isBtn2Focused) LumiereGold else SurfaceVariantDark)
                                .border(
                                    width = if (isBtn2Focused) 2.5.dp else 1.dp,
                                    color = if (isBtn2Focused) Color.White else SurfaceBorder,
                                    shape = CircleShape
                                )
                                .clickable { onSeekRelative(10000L) }
                                .padding(10.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Forward10,
                                contentDescription = "+10с",
                                tint = if (isBtn2Focused) BackgroundDark else TextPrimary,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }

                    // Track & Subtitle Switchers
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (hasAudio) {
                            val isAudioFocused = activeZone == PlayerZone.BOTTOM && bottomBtnIndex == audioBtnIndex
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (isAudioFocused) LumiereGold else SurfaceVariantDark)
                                    .border(
                                        width = if (isAudioFocused) 2.dp else 1.dp,
                                        color = if (isAudioFocused) Color.White else SurfaceBorder,
                                        shape = RoundedCornerShape(10.dp)
                                    )
                                    .clickable { onOpenAudioPopup() }
                                    .padding(horizontal = 14.dp, vertical = 10.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Audiotrack,
                                        contentDescription = null,
                                        tint = if (isAudioFocused) BackgroundDark else TextPrimary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Аудио",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (isAudioFocused) BackgroundDark else TextPrimary,
                                        fontWeight = if (isAudioFocused) FontWeight.Bold else FontWeight.Normal
                                    )
                                }
                            }
                        }

                        if (hasSubs) {
                            val isSubsFocused = activeZone == PlayerZone.BOTTOM && bottomBtnIndex == subBtnIndex
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (isSubsFocused) LumiereGold else SurfaceVariantDark)
                                    .border(
                                        width = if (isSubsFocused) 2.dp else 1.dp,
                                        color = if (isSubsFocused) Color.White else SurfaceBorder,
                                        shape = RoundedCornerShape(10.dp)
                                    )
                                    .clickable { onOpenSubtitlePopup() }
                                    .padding(horizontal = 14.dp, vertical = 10.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Subtitles,
                                        contentDescription = null,
                                        tint = if (isSubsFocused) BackgroundDark else TextPrimary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Субтитры",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (isSubsFocused) BackgroundDark else TextPrimary,
                                        fontWeight = if (isSubsFocused) FontWeight.Bold else FontWeight.Normal
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // In-Place Floating Popup for Audio / Subtitles
            if (popupType != null) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0x99000000))
                        .clickable { onClosePopup() },
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .width(440.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xF0121721))
                            .border(1.5.dp, LumiereGoldGlow, RoundedCornerShape(16.dp))
                            .clickable(enabled = false) {}
                            .padding(24.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (popupType == "audio") "Аудиодорожки" else "Субтитры",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = TextPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "▲ ▼ Выбор • OK Применить",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = TextSecondary
                                )
                            }

                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.heightIn(max = 300.dp)
                            ) {
                                if (popupType == "subs") {
                                    val isItemFocused = popupIndex == 0
                                    val isCurrentSelected = subtitleTracks.none { it.isSelected }
                                    item {
                                        TrackItemRow(
                                            name = "Выключить",
                                            isFocused = isItemFocused,
                                            isSelected = isCurrentSelected,
                                            onClick = {
                                                onSubtitleTrackSelect(-1)
                                                onClosePopup()
                                            }
                                        )
                                    }
                                }

                                val tracks = if (popupType == "audio") audioTracks else subtitleTracks
                                itemsIndexed(tracks) { idx, track ->
                                    val itemFocusIdx = if (popupType == "subs") idx + 1 else idx
                                    val isItemFocused = popupIndex == itemFocusIdx
                                    TrackItemRow(
                                        name = track.name,
                                        isFocused = isItemFocused,
                                        isSelected = track.isSelected,
                                        onClick = {
                                            if (popupType == "audio") onAudioTrackSelect(idx)
                                            else onSubtitleTrackSelect(idx)
                                            onClosePopup()
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackItemRow(
    name: String,
    isFocused: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    isFocused -> LumiereGold
                    isSelected -> LumiereGoldVariant
                    else -> SurfaceVariantDark
                }
            )
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) Color.White else SurfaceBorder,
                shape = RoundedCornerShape(8.dp)
            )
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = name,
                color = if (isFocused || isSelected) BackgroundDark else TextPrimary,
                fontWeight = if (isFocused || isSelected) FontWeight.Bold else FontWeight.Normal,
                style = MaterialTheme.typography.bodyMedium
            )
            if (isSelected) {
                Text(
                    text = "✔",
                    color = BackgroundDark,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
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

package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.*
import com.lumiere.core.model.TorrentItem
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TorrentDialog(
    torrents: List<TorrentItem>,
    isLoading: Boolean,
    onTorrentSelected: (TorrentItem) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            usePlatformDefaultWidth = false
        )
    ) {
        androidx.activity.compose.BackHandler(onBack = onDismiss)

        var qualityFilter by remember { mutableStateOf("all") } // "all", "4k", "1080p", "720p"
        var sortBy by remember { mutableStateOf("score") } // "score", "seeds", "size"

        val filteredAndSortedTorrents = remember(torrents, qualityFilter, sortBy) {
            val list = torrents.filter { item ->
                val meta = TorrentMetaParser.parse(item.title, item.audio, item.quality)
                when (qualityFilter) {
                    "4k" -> meta.resolution == "4K UHD"
                    "1080p" -> meta.resolution == "1080p"
                    "720p" -> meta.resolution == "720p"
                    else -> true
                }
            }
            when (sortBy) {
                "seeds" -> list.sortedByDescending { it.seeders ?: 0 }
                "size" -> list.sortedByDescending { it.sizeBytes ?: 0L }
                else -> list.sortedByDescending { (it.seeders ?: 0) * 10 + if ((it.title.contains("4k", true) || it.title.contains("2160p", true))) 50 else 0 }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .height(620.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(BackgroundDark)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(20.dp))
                .padding(horizontal = 28.dp, vertical = 20.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // 1. Header with Close Button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                text = "Выберите раздачу для просмотра",
                                style = MaterialTheme.typography.titleLarge,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            if (torrents.isNotEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(Color(0x33E8C170))
                                        .border(1.dp, Color(0x66E8C170), CircleShape)
                                        .padding(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "${filteredAndSortedTorrents.size} из ${torrents.size}",
                                        fontSize = 11.sp,
                                        color = LumiereGold,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                        Text(
                            text = "Прямой онлайн-просмотр через TorrServer без предварительной загрузки",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }

                    val closeShape = RoundedCornerShape(10.dp)
                    OutlinedButton(
                        onClick = onDismiss,
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = closeShape),
                            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = closeShape)
                        ),
                        shape = OutlinedButtonDefaults.shape(closeShape),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Закрыть",
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // 2. Filters & Sort Controls Row (like in WGT and Web)
                if (torrents.isNotEmpty()) {
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
                                    onClick = { qualityFilter = id },
                                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                                    colors = ButtonDefaults.colors(
                                        containerColor = if (isSelected) Color(0x33E8C170) else Color(0x11FFFFFF),
                                        contentColor = if (isSelected) LumiereGold else TextSecondary,
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = ButtonDefaults.border(
                                        focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = filterShape),
                                        border = if (isSelected) Border(border = BorderStroke(1.dp, Color(0x66E8C170)), shape = filterShape) else Border.None
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
                                "size" to "По размеру"
                            ).forEach { (id, label) ->
                                val isSelected = sortBy == id
                                val sortShape = RoundedCornerShape(8.dp)
                                Button(
                                    onClick = { sortBy = id },
                                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                                    colors = ButtonDefaults.colors(
                                        containerColor = if (isSelected) Color(0x33E8C170) else Color(0x11FFFFFF),
                                        contentColor = if (isSelected) LumiereGold else TextSecondary,
                                        focusedContainerColor = LumiereGold,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    border = ButtonDefaults.border(
                                        focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = sortShape),
                                        border = if (isSelected) Border(border = BorderStroke(1.dp, Color(0x66E8C170)), shape = sortShape) else Border.None
                                    ),
                                    shape = ButtonDefaults.shape(sortShape),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 3.dp)
                                ) {
                                    Text(label, fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                }

                // 3. Torrents Content List
                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Поиск доступных раздач...",
                            style = MaterialTheme.typography.bodyLarge,
                            color = LumiereGold
                        )
                    }
                } else if (filteredAndSortedTorrents.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = if (torrents.isEmpty()) "Раздачи не найдены" else "Нет раздач с выбранным качеством",
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextSecondary
                        )
                    }
                } else {
                    var launchingMagnet by remember { mutableStateOf<String?>(null) }

                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 2.dp, vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filteredAndSortedTorrents, key = { it.magnet ?: it.title }) { item ->
                            val isLaunching = launchingMagnet == item.magnet
                            TorrentRowItem(
                                item = item,
                                isLaunching = isLaunching,
                                onClick = {
                                    launchingMagnet = item.magnet
                                    onTorrentSelected(item)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TorrentRowItem(
    item: TorrentItem,
    isLaunching: Boolean = false,
    onClick: () -> Unit
) {
    val meta = remember(item.title, item.audio, item.quality) {
        TorrentMetaParser.parse(item.title, item.audio, item.quality)
    }

    val cardShape = RoundedCornerShape(12.dp)
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentHeight(),
        colors = CardDefaults.colors(
            containerColor = if (isLaunching) Color(0x33E8C170) else SurfaceVariantDark,
            focusedContainerColor = SurfaceDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, LumiereGold),
                shape = cardShape
            ),
            border = Border(
                border = BorderStroke(1.dp, if (isLaunching) LumiereGold else SurfaceBorder),
                shape = cardShape
            )
        ),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1f),
        shape = CardDefaults.shape(cardShape)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Title (2 lines max, full details visible)
                Text(
                    text = item.title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 17.sp
                )

                if (isLaunching) {
                    Text(
                        text = "⚡ Подключение к TorrServer и запуск потока...",
                        fontSize = 11.sp,
                        color = LumiereGold,
                        fontWeight = FontWeight.Bold
                    )
                } else {
                    // Rich Badges Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Tracker Pill
                        val tracker = item.tracker
                        if (!tracker.isNullOrBlank()) {
                            BadgePill(
                                text = tracker.uppercase(),
                                bgColor = Color(0x22FFFFFF),
                                borderColor = Color(0x44FFFFFF),
                                textColor = Color(0xFFE2E8F0)
                            )
                        }

                        // Rip Type
                        if (meta.ripType != null) {
                            BadgePill(
                                text = meta.ripType,
                                bgColor = Color(0x2238BDF8),
                                borderColor = Color(0x5538BDF8),
                                textColor = Color(0xFF7DD3FC)
                            )
                        }

                        // Video Codec
                        if (meta.codec != null) {
                            BadgePill(
                                text = meta.codec,
                                bgColor = Color(0x222DD4BF),
                                borderColor = Color(0x552DD4BF),
                                textColor = Color(0xFF5EEAD4)
                            )
                        }

                        // Dubbing / Voiceover Studios
                        if (meta.voices.isNotEmpty()) {
                            meta.voices.take(3).forEach { voice ->
                                BadgePill(
                                    text = voice,
                                    bgColor = Color(0x28A855F7),
                                    borderColor = Color(0x66A855F7),
                                    textColor = Color(0xFFD8B4FE)
                                )
                            }
                        }

                        // Audio Format / Channels
                        if (meta.audioFormat != null) {
                            BadgePill(
                                text = meta.audioFormat,
                                bgColor = Color(0x22F43F5E),
                                borderColor = Color(0x55F43F5E),
                                textColor = Color(0xFFFDA4AF)
                            )
                        }

                        // Subtitles
                        if (meta.subtitles != null) {
                            BadgePill(
                                text = meta.subtitles,
                                bgColor = Color(0x2264748B),
                                borderColor = Color(0x4464748B),
                                textColor = Color(0xFFCBD5E1)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Right Cluster: Quality, HDR, Seeds, Size
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Resolution Badge
                val res = meta.resolution ?: item.quality ?: "1080p"
                val is4k = res.contains("4k", true) || res.contains("2160", true)
                BadgePill(
                    text = res,
                    bgColor = if (is4k) Color(0x33E8C170) else Color(0x2210B981),
                    borderColor = if (is4k) LumiereGold else Color(0x6610B981),
                    textColor = if (is4k) LumiereGold else Color(0xFF6EE7B7),
                    isBold = true
                )

                // HDR / DV Badge
                if (meta.hdr != null) {
                    val isDv = meta.hdr.contains("Vision", true)
                    BadgePill(
                        text = meta.hdr,
                        bgColor = if (isDv) Color(0x33C084FC) else Color(0x22A855F7),
                        borderColor = if (isDv) Color(0x88C084FC) else Color(0x66A855F7),
                        textColor = if (isDv) Color(0xFFF0ABFC) else Color(0xFFE9D5FF),
                        isBold = true
                    )
                }

                // File Size
                val sizeText = remember(item) {
                    TorrentMetaParser.formatSizeSmart(item.sizeFormatted, item.sizeBytes, item.size)
                }
                if (!sizeText.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0x18FFFFFF))
                            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(6.dp))
                            .padding(horizontal = 7.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = sizeText,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextPrimary
                        )
                    }
                }

                // Seeders
                val seeds = item.seeders ?: 0
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0x2210B981))
                        .border(1.dp, Color(0x6610B981), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = "⚡ $seeds",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF6EE7B7)
                    )
                }
            }
        }
    }
}

@Composable
private fun BadgePill(
    text: String,
    bgColor: Color,
    borderColor: Color,
    textColor: Color,
    isBold: Boolean = false
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(5.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(5.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            color = textColor,
            fontSize = 10.sp,
            fontWeight = if (isBold) FontWeight.Bold else FontWeight.Medium
        )
    }
}

package com.lumiere.tv.ui.downloads

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.ServerDownloadItem
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar
import kotlinx.coroutines.launch

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DownloadsScreen(
    onPlayRequested: (streamUrl: String, title: String, subtitle: String, isHls: Boolean) -> Unit,
    onNavigateDestination: (TvNavDestination) -> Unit,
    onProfileClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    viewModel: DownloadsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val downloadsFocusRequester = androidx.compose.runtime.remember { androidx.compose.ui.focus.FocusRequester() }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(80)
        try { downloadsFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        TvTopBar(
            currentDestination = TvNavDestination.DOWNLOADS,
            firstItemFocusRequester = downloadsFocusRequester,
            onNavigate = onNavigateDestination,
            profileName = "Lumiere",
            profileAvatar = null,
            onProfileClick = onProfileClick,
            onNotificationsClick = onNotificationsClick
        )

        // Disk Storage Info Header
        if (uiState.disk != null) {
            val free = uiState.disk?.free ?: "..."
            val total = uiState.disk?.total ?: "..."
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Storage,
                    contentDescription = null,
                    tint = LumiereGold,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "Хранилище сервера: свободно $free из $total",
                    style = MaterialTheme.typography.labelMedium,
                    color = TextSecondary
                )
            }
        }

        if (uiState.isLoading && uiState.downloads.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Загрузка списка...",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiereGold
                )
            }
        } else if (uiState.downloads.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Download,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(48.dp)
                    )
                    Text(
                        text = "На сервере пока нет скачанных файлов",
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                itemsIndexed(
                    items = uiState.downloads,
                    key = { index, item -> "${item.id}_$index" }
                ) { _, item ->
                    DownloadItemCard(
                        item = item,
                        posterUrl = viewModel.resolvePosterUrl(item.poster),
                        onPlayClick = {
                            scope.launch {
                                val url = viewModel.resolveStreamUrl(item)
                                val sub = if (item.season != null && item.season!! > 0) "Сезон ${item.season}, Серия ${item.episode}" else (item.fileSizeFormatted ?: "")
                                onPlayRequested(url, item.title, sub, false)
                            }
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DownloadItemCard(
    item: ServerDownloadItem,
    posterUrl: String,
    onPlayClick: () -> Unit
) {
    Card(
        onClick = onPlayClick,
        colors = CardDefaults.colors(
            containerColor = SurfaceDark,
            focusedContainerColor = SurfaceVariantDark
        ),
        shape = CardDefaults.shape(RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1f),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(2.5.dp, LumiereGold),
                shape = RoundedCornerShape(12.dp)
            )
        ),
        modifier = Modifier
            .fillMaxWidth()
            .height(76.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.weight(1f)
            ) {
                if (posterUrl.isNotBlank()) {
                    AsyncImage(
                        model = posterUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(width = 40.dp, height = 56.dp)
                            .clip(RoundedCornerShape(6.dp))
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(width = 40.dp, height = 56.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(SurfaceVariantDark),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Download, contentDescription = null, tint = LumiereGold)
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                        maxLines = 1
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (item.season != null && item.season!! > 0) {
                            Text(
                                text = "S${item.season}E${item.episode}",
                                style = MaterialTheme.typography.labelSmall,
                                color = LumiereGold,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        val size = item.fileSizeFormatted ?: ""
                        if (size.isNotBlank()) {
                            Text(
                                text = size,
                                style = MaterialTheme.typography.labelSmall,
                                color = TextSecondary
                            )
                        }
                        val isDone = item.status == "completed" || item.progress >= 100
                        Text(
                            text = if (isDone) "Готово к просмотру" else "Загрузка: ${item.progress}%",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isDone) Color(0xFF4ADE80) else LumiereGold
                        )
                    }
                }
            }

            // Play Icon Button
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(LumiereGold.copy(alpha = 0.2f))
                    .border(1.dp, LumiereGold, RoundedCornerShape(18.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Смотреть",
                    tint = LumiereGold,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

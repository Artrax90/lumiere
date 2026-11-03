package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.*
import com.lumiere.core.model.TorrentFile
import com.lumiere.core.model.TorrentItem
import com.lumiere.tv.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TorrentFilesDialog(
    torrent: TorrentItem,
    files: List<TorrentFile>,
    onFileSelected: (TorrentFile) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = false,
            usePlatformDefaultWidth = false
        )
    ) {
        val listState = androidx.compose.foundation.lazy.rememberLazyListState()
        val coroutineScope = rememberCoroutineScope()
        val firstItemFocusRequester = remember { FocusRequester() }

        LaunchedEffect(Unit) {
            delay(150)
            try {
                firstItemFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }

        androidx.activity.compose.BackHandler {
            if (listState.firstVisibleItemIndex > 0) {
                coroutineScope.launch {
                    listState.scrollToItem(0)
                    try {
                        firstItemFocusRequester.requestFocus()
                    } catch (_: Exception) {}
                }
            } else {
                onDismiss()
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
                    Column(
                        modifier = Modifier.weight(1f).padding(end = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                text = "Выберите серию для просмотра",
                                style = MaterialTheme.typography.titleLarge,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            if (files.isNotEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(Color(0x33E8C170))
                                        .border(1.dp, Color(0x66E8C170), CircleShape)
                                        .padding(horizontal = 8.dp, vertical = 2.dp)
                                    ) {
                                    Text(
                                        text = "${files.size} файлов",
                                        fontSize = 11.sp,
                                        color = LumiereGold,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                        Text(
                            text = torrent.title,
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    val closeShape = RoundedCornerShape(10.dp)
                    OutlinedButton(
                        onClick = onDismiss,
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = closeShape),
                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = closeShape)
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

                Spacer(modifier = Modifier.height(14.dp))

                // 2. Files List
                var selectedFileId by remember { mutableStateOf<Int?>(null) }

                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 2.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(files, key = { idx, item -> item.id?.takeIf { it > 0 } ?: idx }) { index, file ->
                        val meta = remember(file.name, file.path) {
                            TorrentMetaParser.parseFileMeta(file)
                        }
                        val cleanName = remember(file.name) {
                            file.name.substringAfterLast('/').substringAfterLast('\\')
                        }
                        val isSelected = file.id != null && selectedFileId == file.id
                        val cardShape = RoundedCornerShape(12.dp)

                        Card(
                            onClick = {
                                selectedFileId = file.id
                                onFileSelected(file)
                            },
                            modifier = (if (index == 0) Modifier.focusRequester(firstItemFocusRequester) else Modifier)
                                .fillMaxWidth()
                                .wrapContentHeight(),
                            colors = CardDefaults.colors(
                                containerColor = if (isSelected) Color(0x33E8C170) else SurfaceVariantDark,
                                focusedContainerColor = SurfaceDark
                            ),
                            border = CardDefaults.border(
                                focusedBorder = Border(
                                    border = BorderStroke(2.dp, LumiereGold),
                                    shape = cardShape
                                ),
                                border = Border(
                                    border = BorderStroke(1.dp, if (isSelected) LumiereGold else SurfaceBorder),
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
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                // Play Icon
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Color(0x22FFFFFF)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        tint = LumiereGold,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }

                                // Center: Episode badge and Filename
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        val epText = when {
                                            meta.season != null && meta.episode != null -> "S${meta.season} · Серия ${meta.episode}"
                                            meta.episode != null -> "Серия ${meta.episode}"
                                            else -> "Серия ${index + 1}"
                                        }
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(Color(0x33E8C170))
                                                .border(1.dp, LumiereGold, RoundedCornerShape(6.dp))
                                                .padding(horizontal = 7.dp, vertical = 2.dp)
                                        ) {
                                            Text(
                                                text = epText,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = LumiereGold
                                            )
                                        }
                                    }

                                    Text(
                                        text = cleanName,
                                        fontSize = 12.5.sp,
                                        color = TextPrimary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                // Right: File Size Badge
                                val fileSize = file.size ?: 0L
                                if (fileSize > 0L) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(Color(0x22FFFFFF))
                                            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(6.dp))
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = TorrentMetaParser.formatSize(fileSize),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFFE2E8F0)
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
}

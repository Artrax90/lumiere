package com.lumiere.tv.ui.iptv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.IptvChannel
import com.lumiere.tv.theme.*

import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun EpgSidebar(
    isVisible: Boolean,
    channels: List<IptvChannel>,
    groups: List<String>,
    selectedGroup: String,
    onGroupSelected: (String) -> Unit,
    activeChannelId: String?,
    onChannelSelected: (IptvChannel) -> Unit,
    resolveLogoUrl: (String?) -> String,
    onClose: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val listFocusRequester = remember { FocusRequester() }

    androidx.compose.runtime.LaunchedEffect(isVisible) {
        if (isVisible) {
            try {
                listFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    if (isVisible) {
        Box(
            modifier = modifier
                .width(420.dp)
                .fillMaxHeight()
                .background(SurfaceDark.copy(alpha = 0.96f))
                .border(
                    BorderStroke(1.dp, SurfaceBorder),
                    shape = RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp)
                )
                .onPreviewKeyEvent { keyEvent ->
                    if (keyEvent.type == KeyEventType.KeyDown) {
                        when (keyEvent.nativeKeyEvent.keyCode) {
                            android.view.KeyEvent.KEYCODE_DPAD_RIGHT,
                            android.view.KeyEvent.KEYCODE_BACK -> {
                                onClose()
                                true
                            }
                            else -> false
                        }
                    } else false
                }
                .padding(vertical = 24.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header
                Column(modifier = Modifier.padding(horizontal = 24.dp)) {
                    Text(
                        text = "ТВ Каналы",
                        style = MaterialTheme.typography.headlineMedium,
                        color = TextPrimary
                    )
                    Text(
                        text = "${channels.size} доступно",
                        style = MaterialTheme.typography.labelMedium,
                        color = TextSecondary
                    )
                }

                // Category Tabs
                if (groups.isNotEmpty()) {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 24.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            val isAll = selectedGroup.isEmpty() || selectedGroup == "Все"
                            Button(
                                onClick = { onGroupSelected("Все") },
                                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                                colors = ButtonDefaults.colors(
                                    containerColor = if (isAll) LumiereGold else SurfaceVariantDark,
                                    contentColor = if (isAll) BackgroundDark else TextSecondary,
                                    focusedContainerColor = Color.White,
                                    focusedContentColor = BackgroundDark
                                ),
                                shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text("Все", fontSize = 12.sp, fontWeight = if (isAll) FontWeight.Bold else FontWeight.Normal)
                            }
                        }

                        items(groups) { group ->
                            val isSelected = group == selectedGroup
                            Button(
                                onClick = { onGroupSelected(group) },
                                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                                colors = ButtonDefaults.colors(
                                    containerColor = if (isSelected) LumiereGold else SurfaceVariantDark,
                                    contentColor = if (isSelected) BackgroundDark else TextSecondary,
                                    focusedContainerColor = Color.White,
                                    focusedContentColor = BackgroundDark
                                ),
                                shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(group, fontSize = 12.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                            }
                        }
                    }
                }

                // Channel List
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(channels, key = { index, ch -> "${ch.id}_$index" }) { index, channel ->
                        val isPlaying = channel.id == activeChannelId
                        ChannelRowItem(
                            channel = channel,
                            isPlaying = isPlaying,
                            logoUrl = resolveLogoUrl(channel.logo),
                            onClick = { onChannelSelected(channel) },
                            modifier = if (index == 0) Modifier.focusRequester(listFocusRequester) else Modifier
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelRowItem(
    channel: IptvChannel,
    isPlaying: Boolean,
    logoUrl: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1.03f),
        modifier = modifier
            .fillMaxWidth()
            .height(58.dp),
        colors = CardDefaults.colors(
            containerColor = if (isPlaying) Color(0x22FFFFFF) else SurfaceVariantDark,
            focusedContainerColor = SurfaceDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, Color.White),
                shape = RoundedCornerShape(10.dp)
            ),
            border = Border.None
        ),
        shape = CardDefaults.shape(RoundedCornerShape(10.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Channel Logo / Fallback
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(SurfaceDark)
                    .border(1.dp, SurfaceBorder, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                if (logoUrl.isNotBlank()) {
                    AsyncImage(
                        model = logoUrl,
                        contentDescription = channel.name,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Text(
                        text = channel.name.take(1).uppercase(),
                        fontSize = 12.sp,
                        color = LumiereGold,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Channel Name & Current Program
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    if (isPlaying) {
                        Text(
                            text = "▶",
                            fontSize = 11.sp,
                            color = LumiereGold
                        )
                    }
                    Text(
                        text = channel.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (isPlaying) LumiereGold else TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                val program = channel.currentProgram
                if (!program.isNullOrBlank()) {
                    Text(
                        text = program,
                        fontSize = 11.sp,
                        color = TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

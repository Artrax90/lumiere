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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = isVisible,
        enter = slideInHorizontally(initialOffsetX = { -it }),
        exit = slideOutHorizontally(targetOffsetX = { -it }),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .width(420.dp)
                .fillMaxHeight()
                .background(SurfaceDark.copy(alpha = 0.96f))
                .border(
                    BorderStroke(1.dp, SurfaceBorder),
                    shape = RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp)
                )
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
                    items(channels, key = { it.id }) { channel ->
                        val isPlaying = channel.id == activeChannelId
                        ChannelRowItem(
                            channel = channel,
                            isPlaying = isPlaying,
                            logoUrl = resolveLogoUrl(channel.logo),
                            onClick = { onChannelSelected(channel) }
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
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp),
        colors = CardDefaults.colors(
            containerColor = if (isPlaying) Color(0x33E8C170) else SurfaceVariantDark,
            focusedContainerColor = SurfaceDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, LumiereGold),
                shape = RoundedCornerShape(10.dp)
            ),
            border = Border(
                border = BorderStroke(1.dp, if (isPlaying) LumiereGoldVariant else Color.Transparent),
                shape = RoundedCornerShape(10.dp)
            )
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
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isPlaying) LumiereGold else TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

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

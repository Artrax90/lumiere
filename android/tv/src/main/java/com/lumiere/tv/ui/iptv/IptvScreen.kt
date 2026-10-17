package com.lumiere.tv.ui.iptv

import android.view.KeyEvent
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.IptvChannel
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar

@OptIn(UnstableApi::class, ExperimentalTvMaterial3Api::class)
@Composable
fun IptvScreen(
    onBackClick: () -> Unit,
    onNavigateDestination: (TvNavDestination) -> Unit = {},
    onProfileClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
    viewModel: IptvViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val playerFocusRequester = remember { FocusRequester() }
    val catalogFocusRequester = remember { FocusRequester() }

    LaunchedEffect(state.isPlayerMode, state.isSidebarVisible) {
        kotlinx.coroutines.delay(60)
        if (state.isPlayerMode && !state.isSidebarVisible) {
            try {
                playerFocusRequester.requestFocus()
            } catch (_: Exception) {}
        } else if (!state.isPlayerMode) {
            try {
                catalogFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Back handling
    BackHandler {
        if (state.isPlayerMode) {
            if (state.isSidebarVisible) {
                viewModel.closeSidebar()
            } else {
                viewModel.exitPlayerMode()
            }
        } else {
            onBackClick()
        }
    }

    if (!state.isPlayerMode) {
        // =========================================================================
        // WGT-STYLE IPTV GUIDE / CATALOG SCREEN
        // =========================================================================
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(BackgroundDark)
        ) {
            TvTopBar(
                currentDestination = TvNavDestination.IPTV,
                firstItemFocusRequester = catalogFocusRequester,
                onNavigate = onNavigateDestination,
                profileName = "Lumiere",
                profileAvatar = null,
                onProfileClick = onProfileClick,
                onNotificationsClick = onNotificationsClick
            )

            // Category Chips Row
            if (state.groups.isNotEmpty()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 32.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    item {
                        val isAll = state.selectedGroup.isEmpty() || state.selectedGroup == "Все"
                        Button(
                            onClick = { viewModel.selectGroup("Все") },
                            scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                            colors = ButtonDefaults.colors(
                                containerColor = if (isAll) LumiereGold else SurfaceVariantDark,
                                contentColor = if (isAll) BackgroundDark else TextSecondary,
                                focusedContainerColor = Color.White,
                                focusedContentColor = BackgroundDark
                            ),
                            shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = "Все каналы (${state.allChannels.size})",
                                fontSize = 13.sp,
                                fontWeight = if (isAll) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    }

                    items(state.groups) { group ->
                        val isSelected = group == state.selectedGroup
                        val count = state.allChannels.count { it.group == group }
                        Button(
                            onClick = { viewModel.selectGroup(group) },
                            scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                            colors = ButtonDefaults.colors(
                                containerColor = if (isSelected) LumiereGold else SurfaceVariantDark,
                                contentColor = if (isSelected) BackgroundDark else TextSecondary,
                                focusedContainerColor = Color.White,
                                focusedContentColor = BackgroundDark
                            ),
                            shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = "$group ($count)",
                                fontSize = 13.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    }
                }
            }

            // Channel Grid
            if (state.isLoading && state.displayedChannels.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Загрузка телеканалов...",
                        style = MaterialTheme.typography.titleMedium,
                        color = LumiereGold
                    )
                }
            } else if (state.displayedChannels.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Телеканалы не найдены",
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary
                    )
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 260.dp),
                    contentPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 8.dp, bottom = 48.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    itemsIndexed(
                        items = state.displayedChannels,
                        key = { index, channel -> "${channel.id}_$index" }
                    ) { _, channel ->
                        IptvChannelGridCard(
                            channel = channel,
                            logoUrl = viewModel.resolveLogoUrl(channel.logo),
                            onClick = { viewModel.playChannel(channel) }
                        )
                    }
                }
            }
        }
    } else {
        // =========================================================================
        // FULLSCREEN LIVE STREAM PLAYER MODE
        // =========================================================================
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .focusRequester(playerFocusRequester)
                .focusable()
                .onPreviewKeyEvent { keyEvent ->
                    if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    if (state.isSidebarVisible) return@onPreviewKeyEvent false

                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_UP -> {
                            viewModel.previousChannel()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            viewModel.nextChannel()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                            viewModel.toggleSidebar()
                            true
                        }
                        else -> false
                    }
                }
        ) {
            // Fullscreen Live Video Stream
            AndroidView(
                factory = { context ->
                    PlayerView(context).apply {
                        this.player = viewModel.player.exoPlayer
                        useController = false
                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                        (videoSurfaceView as? android.view.SurfaceView)?.apply {
                            setZOrderMediaOverlay(true)
                        }
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                },
                onRelease = { playerView ->
                    playerView.player = null
                },
                modifier = Modifier.fillMaxSize()
            )

            // Channel Info Quick Zap Banner (Bottom Left) - instant, zero drop frame
            if (state.showChannelBanner && state.activeChannel != null && !state.isSidebarVisible) {
                val channel = state.activeChannel!!
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(32.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xE607090E))
                        .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                        .padding(horizontal = 20.dp, vertical = 14.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(SurfaceVariantDark)
                                .border(1.dp, LumiereGold, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            val logo = viewModel.resolveLogoUrl(channel.logo)
                            if (logo.isNotBlank()) {
                                AsyncImage(
                                    model = logo,
                                    contentDescription = null,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Icon(Icons.Default.LiveTv, contentDescription = null, tint = LumiereGold)
                            }
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = channel.name,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = TextPrimary
                                )
                                val grp = channel.group
                                if (!grp.isNullOrBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0x33E8C170))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = grp,
                                            fontSize = 10.sp,
                                            color = LumiereGold,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            val cur = channel.currentProgram
                            if (!cur.isNullOrBlank()) {
                                Text(
                                    text = cur,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = LumiereGold
                                )
                            }
                            val next = channel.nextProgram
                            if (!next.isNullOrBlank()) {
                                Text(
                                    text = "Далее: $next",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary
                                )
                            }
                        }
                    }
                }
            }

            // Interactive EPG Sidebar
            EpgSidebar(
                isVisible = state.isSidebarVisible,
                channels = state.displayedChannels,
                groups = state.groups,
                selectedGroup = state.selectedGroup,
                onGroupSelected = { viewModel.selectGroup(it) },
                activeChannelId = state.activeChannel?.id,
                onChannelSelected = { viewModel.playChannel(it) },
                resolveLogoUrl = { viewModel.resolveLogoUrl(it) },
                onClose = { viewModel.closeSidebar() },
                modifier = Modifier.align(Alignment.CenterStart)
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun IptvChannelGridCard(
    channel: IptvChannel,
    logoUrl: String,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
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
            .height(72.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Logo / Monogram
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(SurfaceVariantDark)
                    .border(1.dp, SurfaceBorder, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                if (logoUrl.isNotBlank()) {
                    AsyncImage(
                        model = logoUrl,
                        contentDescription = channel.name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(4.dp)
                    )
                } else {
                    Text(
                        text = channel.name.take(2).uppercase(),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = LumiereGold
                    )
                }
            }

            // Name & Current EPG Program
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = channel.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    val grp = channel.group
                    if (!grp.isNullOrBlank()) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0x22FFFFFF))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        ) {
                            Text(
                                text = grp,
                                fontSize = 9.sp,
                                color = TextSecondary,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }

                val cur = channel.currentProgram
                Text(
                    text = if (!cur.isNullOrBlank()) cur else "Прямой эфир",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (!cur.isNullOrBlank()) LumiereGold else TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Play Icon
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(LumiereGold.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Смотреть",
                    tint = LumiereGold,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

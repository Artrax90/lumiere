package com.lumiere.tv.ui.iptv

import android.view.KeyEvent
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
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
import kotlinx.coroutines.isActive
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.EpgProgram
import com.lumiere.core.model.IptvChannel
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar

private fun android.content.Context.findActivity(): android.app.Activity? {
    var ctx = this
    while (ctx is android.content.ContextWrapper) {
        if (ctx is android.app.Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

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
    val context = androidx.compose.ui.platform.LocalContext.current

    val isPlaying by viewModel.player.isPlaying.collectAsState()

    DisposableEffect(state.isPlayerMode || state.isMultiViewMode) {
        val window = context.findActivity()?.window
        if (state.isPlayerMode || state.isMultiViewMode) {
            window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            window?.decorView?.keepScreenOn = true
        }
        onDispose {
            window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            window?.decorView?.keepScreenOn = false
        }
    }

    LaunchedEffect(state.isPlayerMode, state.isMultiViewMode, isPlaying) {
        if (state.isPlayerMode || state.isMultiViewMode) {
            val window = context.findActivity()?.window
            while (isActive) {
                window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                window?.decorView?.keepScreenOn = true
                kotlinx.coroutines.delay(20_000L)
            }
        }
    }

    LaunchedEffect(state.isPlayerMode, state.isMultiViewMode, state.isSidebarVisible) {
        kotlinx.coroutines.delay(60)
        if (state.isPlayerMode && !state.isSidebarVisible) {
            try {
                playerFocusRequester.requestFocus()
            } catch (_: Exception) {}
        } else if (!state.isPlayerMode && !state.isMultiViewMode) {
            try {
                catalogFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Back handling
    BackHandler {
        when {
            state.isMultiViewMode -> {
                viewModel.exitMultiView()
            }
            state.isPlayerMode -> {
                if (state.isSidebarVisible) {
                    viewModel.closeSidebar()
                } else {
                    viewModel.exitPlayerMode()
                }
            }
            else -> {
                onBackClick()
            }
        }
    }

    if (state.isMultiViewMode) {
        // =========================================================================
        // SIDE-BY-SIDE 50/50 MULTI-VIEW (DUAL PLAYER)
        // =========================================================================
        IptvMultiViewScreen(
            viewModel = viewModel,
            state = state
        )
    } else if (state.isPlayerMode) {
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
                        KeyEvent.KEYCODE_PROG_YELLOW, KeyEvent.KEYCODE_MENU -> {
                            viewModel.enterMultiView()
                            true
                        }
                        else -> false
                    }
                }
        ) {
            // Fullscreen Live Video Stream
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        this.player = viewModel.player.exoPlayer
                        useController = false
                        keepScreenOn = true
                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                        (videoSurfaceView as? android.view.SurfaceView)?.apply {
                            setZOrderMediaOverlay(true)
                            keepScreenOn = true
                        }
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                },
                update = { playerView ->
                    playerView.keepScreenOn = true
                    (playerView.videoSurfaceView as? android.view.SurfaceView)?.keepScreenOn = true
                },
                onRelease = { playerView ->
                    playerView.keepScreenOn = false
                },
                modifier = Modifier.fillMaxSize()
            )

            // Channel Quick-Zap Info Banner (Bottom Left)
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

            // Interactive EPG Sidebar Overlay
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
    } else {
        // =========================================================================
        // NEXT-GEN 3-COLUMN IPTV GUIDE WITH LIVE PREVIEW
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

            if (state.isLoading && state.allChannels.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "Загрузка телеканалов...",
                        style = MaterialTheme.typography.titleMedium,
                        color = LumiereGold
                    )
                }
            } else if (state.allChannels.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = state.errorMessage ?: "Телеканалы не найдены",
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary
                    )
                }
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 24.dp, vertical = 8.dp)
                ) {
                    // COLUMN 1: Categories (Width 220dp)
                    Column(
                        modifier = Modifier
                            .width(220.dp)
                            .fillMaxHeight()
                            .background(SurfaceDark.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                            .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                            .padding(vertical = 12.dp, horizontal = 10.dp)
                    ) {
                        Text(
                            text = "КАТЕГОРИИ",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary,
                            letterSpacing = 1.sp,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )

                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(state.groups) { group ->
                                val isSelected = group == state.selectedGroup
                                val count = when (group) {
                                    "★ Избранное" -> state.favoriteIds.size
                                    "Все" -> state.allChannels.size
                                    else -> state.allChannels.count { it.group == group }
                                }

                                Surface(
                                    onClick = { viewModel.selectGroup(group) },
                                    colors = ClickableSurfaceDefaults.colors(
                                        containerColor = if (isSelected) LumiereGold.copy(alpha = 0.15f) else Color.Transparent,
                                        focusedContainerColor = LumiereGold,
                                        contentColor = if (isSelected) LumiereGold else TextPrimary,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    scale = ClickableSurfaceDefaults.scale(scale = 1f, focusedScale = 1.02f),
                                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
                                    border = ClickableSurfaceDefaults.border(
                                        border = Border(
                                            border = androidx.compose.foundation.BorderStroke(
                                                width = if (isSelected) 1.dp else 0.dp,
                                                color = if (isSelected) LumiereGold.copy(alpha = 0.5f) else Color.Transparent
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        ),
                                        focusedBorder = Border(
                                            border = androidx.compose.foundation.BorderStroke(2.dp, Color.White),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = group,
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false)
                                        )
                                        Text(
                                            text = "$count",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = if (isSelected) LumiereGold else TextSecondary.copy(alpha = 0.7f),
                                            modifier = Modifier.padding(start = 6.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    // COLUMN 2: Channels List (Width 360dp)
                    Column(
                        modifier = Modifier
                            .width(360.dp)
                            .fillMaxHeight()
                            .background(SurfaceDark.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                            .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                            .padding(vertical = 12.dp, horizontal = 10.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "КАНАЛЫ (${state.displayedChannels.size})",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary,
                                letterSpacing = 1.sp
                            )
                            Text(
                                text = "OK: эфир",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = LumiereGold
                            )
                        }

                        val channelsListState = rememberLazyListState()

                        LazyColumn(
                            state = channelsListState,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            itemsIndexed(
                                items = state.displayedChannels,
                                key = { index, ch -> "${ch.id}_$index" }
                            ) { _, channel ->
                                val isFocused = state.focusedChannel?.id == channel.id
                                val isFav = state.favoriteIds.contains(channel.id) || state.favoriteIds.contains(channel.name)

                                Surface(
                                    onClick = { viewModel.enterFullscreen(channel) },
                                    colors = ClickableSurfaceDefaults.colors(
                                        containerColor = if (isFocused) SurfaceVariantDark else Color.Transparent,
                                        focusedContainerColor = SurfaceVariantDark,
                                        contentColor = TextPrimary,
                                        focusedContentColor = TextPrimary
                                    ),
                                    scale = ClickableSurfaceDefaults.scale(scale = 1f, focusedScale = 1.02f),
                                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
                                    border = ClickableSurfaceDefaults.border(
                                        border = Border(
                                            border = androidx.compose.foundation.BorderStroke(
                                                width = if (isFocused) 1.5.dp else 1.dp,
                                                color = if (isFocused) LumiereGold.copy(alpha = 0.5f) else SurfaceBorder.copy(alpha = 0.5f)
                                            ),
                                            shape = RoundedCornerShape(10.dp)
                                        ),
                                        focusedBorder = Border(
                                            border = androidx.compose.foundation.BorderStroke(2.dp, LumiereGold),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .onFocusChanged {
                                            if (it.isFocused) {
                                                viewModel.onChannelFocused(channel)
                                            }
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        // Logo
                                        Box(
                                            modifier = Modifier
                                                .size(36.dp)
                                                .clip(CircleShape)
                                                .background(SurfaceDark)
                                                .border(1.dp, SurfaceBorder, CircleShape),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            val logo = viewModel.resolveLogoUrl(channel.logo)
                                            if (logo.isNotBlank()) {
                                                AsyncImage(
                                                    model = logo,
                                                    contentDescription = null,
                                                    contentScale = ContentScale.Fit,
                                                    modifier = Modifier
                                                        .fillMaxSize()
                                                        .padding(3.dp)
                                                )
                                            } else {
                                                Text(
                                                    text = channel.name.take(2).uppercase(),
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = LumiereGold
                                                )
                                            }
                                        }

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
                                                    fontSize = 14.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = TextPrimary,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                    modifier = Modifier.weight(1f, fill = false)
                                                )
                                                if (isFav) {
                                                    Icon(
                                                        imageVector = Icons.Default.Star,
                                                        contentDescription = "Избранное",
                                                        tint = LumiereGold,
                                                        modifier = Modifier.size(13.dp)
                                                    )
                                                }
                                            }

                                            val cur = channel.currentProgram
                                            Text(
                                                text = if (!cur.isNullOrBlank()) cur else "Прямой эфир",
                                                fontSize = 11.sp,
                                                color = if (!cur.isNullOrBlank()) LumiereGold else TextSecondary,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    // COLUMN 3: Live Preview & EPG Program Hub (Flex remainder)
                    val focusedChannel = state.focusedChannel ?: state.activeChannel ?: state.displayedChannels.firstOrNull()

                    if (focusedChannel != null) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(SurfaceDark.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                                .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                                .padding(16.dp)
                        ) {
                            // 16:9 Live Preview Video Frame
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(240.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color.Black)
                                    .border(1.dp, SurfaceBorder, RoundedCornerShape(14.dp))
                            ) {
                                AndroidView(
                                    factory = { ctx ->
                                        PlayerView(ctx).apply {
                                            this.player = viewModel.player.exoPlayer
                                            useController = false
                                            keepScreenOn = false
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
                                    modifier = Modifier.fillMaxSize()
                                )

                                // Live Badge overlay on top-left of video
                                Row(
                                    modifier = Modifier
                                        .align(Alignment.TopStart)
                                        .padding(10.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(Color(0xCC0B0E14))
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(7.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFFEF4444))
                                    )
                                    Text(
                                        text = "ПРЯМОЙ ЭФИР",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            // Channel Title & Category
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = focusedChannel.name,
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = TextPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                val grp = focusedChannel.group
                                if (!grp.isNullOrBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(LumiereGold.copy(alpha = 0.15f))
                                            .border(1.dp, LumiereGold.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                                            .padding(horizontal = 8.dp, vertical = 3.dp)
                                    ) {
                                        Text(
                                            text = grp,
                                            fontSize = 11.sp,
                                            color = LumiereGold,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            // Current Program Details Card
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(SurfaceVariantDark.copy(alpha = 0.7f))
                                    .border(1.dp, SurfaceBorder, RoundedCornerShape(12.dp))
                                    .padding(12.dp)
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    val curProg = state.currentProgramDetail
                                    val title = curProg?.title?.ifBlank { focusedChannel.currentProgram } ?: (focusedChannel.currentProgram ?: "Прямой эфир")

                                    Text(
                                        text = title,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextPrimary,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )

                                    // Time text & progress bar
                                    if (state.currentProgramTimeText.isNotBlank()) {
                                        Text(
                                            text = state.currentProgramTimeText,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = LumiereGold
                                        )
                                    }

                                    // Progress Bar
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(5.dp)
                                            .clip(RoundedCornerShape(3.dp))
                                            .background(Color.White.copy(alpha = 0.12f))
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxHeight()
                                                .fillMaxWidth(state.currentProgramProgress.coerceIn(0f, 1f))
                                                .background(
                                                    brush = Brush.horizontalGradient(
                                                        listOf(LumiereGold, Color(0xFFF59E0B))
                                                    ),
                                                    shape = RoundedCornerShape(3.dp)
                                                )
                                        )
                                    }

                                    if (!curProg?.desc.isNullOrBlank()) {
                                        Text(
                                            text = curProg!!.desc!!,
                                            fontSize = 11.sp,
                                            color = TextSecondary,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Action Buttons Row
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                val isFav = state.favoriteIds.contains(focusedChannel.id) || state.favoriteIds.contains(focusedChannel.name)

                                Button(
                                    onClick = { viewModel.enterFullscreen(focusedChannel) },
                                    colors = ButtonDefaults.colors(
                                        containerColor = LumiereGold,
                                        contentColor = BackgroundDark,
                                        focusedContainerColor = Color.White,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Text(text = "На весь экран", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }

                                Button(
                                    onClick = { viewModel.toggleFavorite(focusedChannel) },
                                    colors = ButtonDefaults.colors(
                                        containerColor = SurfaceVariantDark,
                                        contentColor = if (isFav) LumiereGold else TextSecondary,
                                        focusedContainerColor = Color.White,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (isFav) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                            contentDescription = null,
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Text(
                                            text = if (isFav) "В избранном" else "В закладки",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }

                                Button(
                                    onClick = { viewModel.enterMultiView() },
                                    colors = ButtonDefaults.colors(
                                        containerColor = SurfaceVariantDark,
                                        contentColor = TextSecondary,
                                        focusedContainerColor = Color.White,
                                        focusedContentColor = BackgroundDark
                                    ),
                                    shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Default.Tv, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Text(text = "2 экрана (Multi-View)", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }

                            // Upcoming Schedule
                            if (state.upcomingSchedule.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = "ДАЛЕЕ В ЭФИРЕ",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextSecondary,
                                    letterSpacing = 1.sp
                                )
                                Spacer(modifier = Modifier.height(6.dp))

                                LazyColumn(
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                    modifier = Modifier.fillMaxWidth().weight(1f)
                                ) {
                                    items(state.upcomingSchedule) { prog ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 3.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            Text(
                                                text = prog.startTime ?: "--:--",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = LumiereGold
                                            )
                                            Text(
                                                text = prog.title,
                                                fontSize = 12.sp,
                                                color = TextPrimary,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f)
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
}

// =========================================================================
// SIDE-BY-SIDE 50/50 MULTI-VIEW DUAL PLAYER COMPONENT
// =========================================================================
@OptIn(UnstableApi::class, ExperimentalTvMaterial3Api::class)
@Composable
private fun IptvMultiViewScreen(
    viewModel: IptvViewModel,
    state: IptvUiState
) {
    val multiFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(60)
        try { multiFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(multiFocusRequester)
            .focusable()
            .onPreviewKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (keyEvent.nativeKeyEvent.keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        viewModel.switchMultiViewAudio()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        viewModel.exitMultiView()
                        true
                    }
                    else -> false
                }
            }
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            // LEFT CHANNEL (Primary)
            val isLeftAudio = state.multiViewAudioOnPrimary
            val primaryChannel = state.activeChannel

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .border(
                        width = if (isLeftAudio) 3.dp else 1.dp,
                        color = if (isLeftAudio) LumiereGold else Color(0x33FFFFFF)
                    )
            ) {
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            this.player = viewModel.player.exoPlayer
                            useController = false
                            keepScreenOn = true
                            setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // Top banner on Left
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xCC07090E))
                        .border(1.dp, if (isLeftAudio) LumiereGold else SurfaceBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = if (isLeftAudio) "🔊 ЗВУК ВКЛЮЧЕН" else "🔇 БЕЗ ЗВУКА",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isLeftAudio) LumiereGold else TextSecondary
                    )
                    Text(
                        text = primaryChannel?.name ?: "Канал 1",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            // RIGHT CHANNEL (Secondary)
            val isRightAudio = !state.multiViewAudioOnPrimary
            val secondaryChannel = state.multiViewSecondaryChannel

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .border(
                        width = if (isRightAudio) 3.dp else 1.dp,
                        color = if (isRightAudio) LumiereGold else Color(0x33FFFFFF)
                    )
            ) {
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            this.player = viewModel.secondaryPlayer?.exoPlayer
                            useController = false
                            keepScreenOn = true
                            setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // Top banner on Right
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xCC07090E))
                        .border(1.dp, if (isRightAudio) LumiereGold else SurfaceBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = if (isRightAudio) "🔊 ЗВУК ВКЛЮЧЕН" else "🔇 БЕЗ ЗВУКА",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isRightAudio) LumiereGold else TextSecondary
                    )
                    Text(
                        text = secondaryChannel?.name ?: "Канал 2",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }

        // Bottom Navigation Bar Hint for Multi-View
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 24.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xEE07090E))
                .border(1.dp, LumiereGold.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
                .padding(horizontal = 24.dp, vertical = 10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "◄ ► Переключить звук",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = LumiereGold
                )
                Text(
                    text = "•",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
                Text(
                    text = "OK: Развернуть на весь экран",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimary
                )
                Text(
                    text = "•",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
                Text(
                    text = "Назад: Выход",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = TextSecondary
                )
            }
        }
    }
}

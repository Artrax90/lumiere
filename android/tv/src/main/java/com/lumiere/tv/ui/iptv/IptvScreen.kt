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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.tv.theme.*

@OptIn(UnstableApi::class, ExperimentalTvMaterial3Api::class)
@Composable
fun IptvScreen(
    onBackClick: () -> Unit,
    viewModel: IptvViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    val handleBack: () -> Unit = {
        if (state.isSidebarVisible) {
            viewModel.closeSidebar()
        } else {
            onBackClick()
        }
    }

    BackHandler(onBack = handleBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onKeyEvent { keyEvent ->
                if (keyEvent.type != KeyEventType.KeyDown) return@onKeyEvent false

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
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Channel Info Quick Banner (Bottom Left, shows when zapping channels)
        AnimatedVisibility(
            visible = state.showChannelBanner && state.activeChannel != null && !state.isSidebarVisible,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(32.dp)
        ) {
            val channel = state.activeChannel!!
            Box(
                modifier = Modifier
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
                            .size(44.dp)
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
                                color = TextSecondary
                            )
                        }
                    }
                }
            }
        }

        // Sliding EPG Sidebar
        EpgSidebar(
            isVisible = state.isSidebarVisible,
            channels = state.displayedChannels,
            groups = state.groups,
            selectedGroup = state.selectedGroup,
            onGroupSelected = { viewModel.selectGroup(it) },
            activeChannelId = state.activeChannel?.id,
            onChannelSelected = { viewModel.playChannel(it) },
            resolveLogoUrl = { viewModel.resolveLogoUrl(it) },
            modifier = Modifier.align(Alignment.CenterStart)
        )
    }
}

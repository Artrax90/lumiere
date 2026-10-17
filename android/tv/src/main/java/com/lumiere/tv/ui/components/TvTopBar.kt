package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.tv.theme.*

enum class TvNavDestination {
    HOME,
    MOVIES,
    SERIES,
    IPTV,
    MY,
    DOWNLOADS,
    COLLECTIONS,
    SEARCH,
    SETTINGS
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvTopBar(
    currentDestination: TvNavDestination,
    onNavigate: (TvNavDestination) -> Unit,
    profileName: String? = null,
    profileAvatar: String? = null,
    onProfileClick: () -> Unit,
    unreadNotificationsCount: Int = 0,
    onNotificationsClick: () -> Unit = {},
    firstItemFocusRequester: FocusRequester? = null,
    modifier: Modifier = Modifier
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val preferences = remember { com.lumiere.core.storage.AppPreferences(context.applicationContext) }
    val savedProfileName by preferences.activeProfileName.collectAsState(initial = null)
    val savedProfileAvatar by preferences.activeProfileAvatar.collectAsState(initial = null)
    val serverUrl by preferences.serverUrl.collectAsState(initial = null)

    val rawName: String? = profileName ?: savedProfileName
    val displayName: String = if (rawName.isNullOrBlank() || rawName == "Lumiere") {
        val s = savedProfileName
        if (s.isNullOrBlank()) "Профиль" else s
    } else {
        rawName
    }

    val rawAvatar = if (!profileAvatar.isNullOrBlank()) profileAvatar else savedProfileAvatar
    val resolvedAvatar = androidx.compose.runtime.remember(rawAvatar, serverUrl) {
        if (rawAvatar.isNullOrBlank()) null
        else if (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://")) rawAvatar
        else {
            val base = serverUrl.orEmpty().trimEnd('/')
            if (base.isNotBlank()) "$base/${rawAvatar.trimStart('/')}" else rawAvatar
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 1. Brand Logo
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(LumiereGold)
            )
            Text(
                text = "LUMIÈRE",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = LumiereGold,
                letterSpacing = 2.sp
            )
        }

        // 2. Navigation Items (Main categories)
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TopBarItem(
                label = "Главная",
                selected = currentDestination == TvNavDestination.HOME,
                onClick = { onNavigate(TvNavDestination.HOME) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.HOME) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
            TopBarItem(
                label = "Фильмы",
                selected = currentDestination == TvNavDestination.MOVIES,
                onClick = { onNavigate(TvNavDestination.MOVIES) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.MOVIES) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
            TopBarItem(
                label = "Сериалы",
                selected = currentDestination == TvNavDestination.SERIES,
                onClick = { onNavigate(TvNavDestination.SERIES) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.SERIES) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
            TopBarItem(
                label = "IPTV",
                selected = currentDestination == TvNavDestination.IPTV,
                onClick = { onNavigate(TvNavDestination.IPTV) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.IPTV) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
            TopBarItem(
                label = "Моё",
                selected = currentDestination == TvNavDestination.MY,
                onClick = { onNavigate(TvNavDestination.MY) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.MY) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
            TopBarItem(
                label = "Подборки",
                selected = currentDestination == TvNavDestination.COLLECTIONS,
                onClick = { onNavigate(TvNavDestination.COLLECTIONS) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.COLLECTIONS) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
            TopBarItem(
                label = "Скачанное",
                selected = currentDestination == TvNavDestination.DOWNLOADS,
                onClick = { onNavigate(TvNavDestination.DOWNLOADS) },
                modifier = if (firstItemFocusRequester != null && currentDestination == TvNavDestination.DOWNLOADS) Modifier.focusRequester(firstItemFocusRequester) else Modifier
            )
        }

        // 3. Right Cluster (Search, Notifications, Settings, Profile) - Anchored & Overflow Proof
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Search Icon Button
            Button(
                onClick = { onNavigate(TvNavDestination.SEARCH) },
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                colors = ButtonDefaults.colors(
                    containerColor = if (currentDestination == TvNavDestination.SEARCH) Color(0x33E8C170) else SurfaceDark,
                    contentColor = if (currentDestination == TvNavDestination.SEARCH) LumiereGold else TextSecondary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = CircleShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(CircleShape),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier.size(34.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Поиск",
                        modifier = Modifier.size(17.dp)
                    )
                }
            }

            // Notification Bell Button with Unclipped External Badge
            Box(modifier = Modifier.size(34.dp)) {
                Button(
                    onClick = onNotificationsClick,
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                    colors = ButtonDefaults.colors(
                        containerColor = SurfaceDark,
                        contentColor = if (unreadNotificationsCount > 0) LumiereGold else TextSecondary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = CircleShape),
                        border = Border.None
                    ),
                    shape = ButtonDefaults.shape(CircleShape),
                    contentPadding = PaddingValues(0.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Notifications,
                            contentDescription = "Уведомления",
                            modifier = Modifier.size(17.dp)
                        )
                    }
                }

                if (unreadNotificationsCount > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 2.dp, y = (-2).dp)
                            .clip(CircleShape)
                            .background(LumiereGold)
                            .border(1.5.dp, BackgroundDark, CircleShape)
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = if (unreadNotificationsCount > 9) "9+" else unreadNotificationsCount.toString(),
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            color = BackgroundDark
                        )
                    }
                }
            }

            // Settings Icon Button
            Button(
                onClick = { onNavigate(TvNavDestination.SETTINGS) },
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                colors = ButtonDefaults.colors(
                    containerColor = if (currentDestination == TvNavDestination.SETTINGS) Color(0x33E8C170) else SurfaceDark,
                    contentColor = if (currentDestination == TvNavDestination.SETTINGS) LumiereGold else TextSecondary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = CircleShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(CircleShape),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier.size(34.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Настройки",
                        modifier = Modifier.size(17.dp)
                    )
                }
            }

            // Profile Button (Avatar + Name)
            Button(
                onClick = onProfileClick,
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = RoundedCornerShape(16.dp)),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(RoundedCornerShape(16.dp)),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .clip(CircleShape)
                            .background(SurfaceVariantDark)
                            .border(1.dp, LumiereGold, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        if (!resolvedAvatar.isNullOrBlank()) {
                            AsyncImage(
                                model = resolvedAvatar,
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            val initial = displayName.firstOrNull()?.uppercaseChar()?.toString() ?: "U"
                            Text(
                                text = initial,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = LumiereGold
                            )
                        }
                    }

                    Text(
                        text = displayName,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TopBarItem(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(8.dp)
    Button(
        onClick = onClick,
        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
        colors = ButtonDefaults.colors(
            containerColor = if (selected) Color(0x33E8C170) else Color.Transparent,
            contentColor = if (selected) LumiereGold else TextSecondary,
            focusedContainerColor = LumiereGold,
            focusedContentColor = BackgroundDark
        ),
        border = ButtonDefaults.border(
            focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = shape),
            border = Border.None
        ),
        shape = ButtonDefaults.shape(shape),
        contentPadding = PaddingValues(horizontal = 9.dp, vertical = 5.dp),
        modifier = modifier
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
        )
    }
}

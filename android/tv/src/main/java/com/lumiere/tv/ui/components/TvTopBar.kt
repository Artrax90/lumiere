package com.lumiere.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
    SEARCH
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvTopBar(
    currentDestination: TvNavDestination,
    onNavigate: (TvNavDestination) -> Unit,
    profileName: String?,
    profileAvatar: String?,
    onProfileClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Logo
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "LUMIÈRE",
                style = MaterialTheme.typography.titleLarge,
                color = LumiereGold,
                letterSpacing = 2.sp
            )
        }

        // Navigation Items
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TopBarItem(
                label = "Главная",
                icon = Icons.Default.Home,
                selected = currentDestination == TvNavDestination.HOME,
                onClick = { onNavigate(TvNavDestination.HOME) }
            )
            TopBarItem(
                label = "Фильмы",
                icon = Icons.Default.Movie,
                selected = currentDestination == TvNavDestination.MOVIES,
                onClick = { onNavigate(TvNavDestination.MOVIES) }
            )
            TopBarItem(
                label = "Сериалы",
                icon = Icons.Default.Tv,
                selected = currentDestination == TvNavDestination.SERIES,
                onClick = { onNavigate(TvNavDestination.SERIES) }
            )
            TopBarItem(
                label = "IPTV",
                icon = Icons.Default.LiveTv,
                selected = currentDestination == TvNavDestination.IPTV,
                onClick = { onNavigate(TvNavDestination.IPTV) }
            )
            TopBarItem(
                label = "Поиск",
                icon = Icons.Default.Search,
                selected = currentDestination == TvNavDestination.SEARCH,
                onClick = { onNavigate(TvNavDestination.SEARCH) }
            )
        }

        // Profile Button
        Button(
            onClick = onProfileClick,
            colors = ButtonDefaults.colors(
                containerColor = SurfaceDark,
                contentColor = TextPrimary,
                focusedContainerColor = LumiereGold,
                focusedContentColor = BackgroundDark
            ),
            shape = ButtonDefaults.shape(RoundedCornerShape(20.dp)),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(SurfaceVariantDark)
                        .border(1.dp, LumiereGold, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    if (!profileAvatar.isNullOrBlank()) {
                        AsyncImage(
                            model = profileAvatar,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        Text(
                            text = (profileName?.take(1) ?: "U").uppercase(),
                            fontSize = 11.sp,
                            color = LumiereGold
                        )
                    }
                }

                Text(
                    text = profileName ?: "Профиль",
                    style = MaterialTheme.typography.labelMedium
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TopBarItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.colors(
            containerColor = if (selected) Color(0x33E8C170) else Color.Transparent,
            contentColor = if (selected) LumiereGold else TextSecondary,
            focusedContainerColor = LumiereGold,
            focusedContentColor = BackgroundDark
        ),
        shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

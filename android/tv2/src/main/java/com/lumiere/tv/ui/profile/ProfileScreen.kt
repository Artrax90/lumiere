package com.lumiere.tv.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.MediaCard

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBackClick: () -> Unit,
    onTitleClick: (Title) -> Unit,
    onSwitchProfileClick: () -> Unit,
    onLogoutClick: () -> Unit,
    viewModel: ProfileViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableStateOf("overview") } // "overview", "favorites"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(horizontal = 48.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // Top Navigation Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedButton(
                    onClick = onBackClick,
                    colors = OutlinedButtonDefaults.colors(
                        focusedContainerColor = Color(0x22FFFFFF),
                        focusedContentColor = TextPrimary
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Назад",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Назад", style = MaterialTheme.typography.labelMedium)
                }

                Text(
                    text = "Мой профиль",
                    style = MaterialTheme.typography.headlineMedium,
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold
                )
            }

            // Action Buttons
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onSwitchProfileClick,
                    colors = ButtonDefaults.colors(
                        containerColor = SurfaceDark,
                        contentColor = TextPrimary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.Group, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Сменить профиль", fontSize = 12.sp)
                }

                OutlinedButton(
                    onClick = {
                        viewModel.logout(onLogoutClick)
                    },
                    colors = OutlinedButtonDefaults.colors(
                        focusedContainerColor = Color(0x33EF4444),
                        focusedContentColor = Color(0xFFFCA5A5)
                    ),
                    shape = OutlinedButtonDefaults.shape(RoundedCornerShape(8.dp)),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.ExitToApp, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Выйти", fontSize = 12.sp)
                }
            }
        }

        // User Header Card
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(SurfaceDark)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Large Avatar
            Box(
                modifier = Modifier
                    .size(68.dp)
                    .clip(CircleShape)
                    .background(SurfaceVariantDark)
                    .border(2.dp, LumiereGold, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                if (!state.avatarUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = state.avatarUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    val initial = state.userName.firstOrNull()?.uppercaseChar()?.toString() ?: "U"
                    Text(
                        text = initial,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = LumiereGold
                    )
                }
            }

            // User Info
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = state.userName.ifBlank { "Пользователь Lumière" },
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(Color(0x22E8C170))
                            .border(1.dp, Color(0x66E8C170), CircleShape)
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = if (state.isKids) "Детский профиль" else "Основной профиль",
                            fontSize = 11.sp,
                            color = LumiereGold
                        )
                    }
                }

                Text(
                    text = "Персональные настройки, история просмотров и синхронизация с сервером",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }

            // Tabs Switcher
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                listOf(
                    "overview" to "Обзор",
                    "favorites" to "Избранное (${state.favorites.size})"
                ).forEach { (tabId, label) ->
                    val isSelected = selectedTab == tabId
                    Button(
                        onClick = { selectedTab = tabId },
                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                        colors = ButtonDefaults.colors(
                            containerColor = if (isSelected) Color(0x33E8C170) else Color(0x11FFFFFF),
                            contentColor = if (isSelected) LumiereGold else TextSecondary,
                            focusedContainerColor = LumiereGold,
                            focusedContentColor = BackgroundDark
                        ),
                        shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Text(label, fontSize = 12.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
        }

        // Tab Content
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            if (selectedTab == "overview") {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "Статистика просмотра",
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        val timeStr = if (state.totalWatchHours >= 1.0) {
                            "${state.totalWatchHours} ч"
                        } else {
                            "${state.totalWatchMinutes} мин"
                        }

                        StatCard(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.Schedule,
                            value = timeStr,
                            label = "Время просмотра"
                        )

                        val countLabel = if (state.moviesCount > 0 || state.episodesCount > 0) {
                            "${state.moviesCount} филм. / ${state.episodesCount} сер."
                        } else {
                            "Фильмов и серий"
                        }
                        StatCard(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.PlayArrow,
                            value = "${state.watchedTitlesCount}",
                            label = countLabel
                        )

                        StatCard(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.Tv,
                            value = state.primaryDevice,
                            label = "Устройство"
                        )

                        StatCard(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.Bookmark,
                            value = "${state.favorites.size}",
                            label = "В избранном"
                        )
                    }

                    // Любимые жанры
                    if (state.favoriteGenres.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(SurfaceDark)
                                .border(1.dp, SurfaceBorder, RoundedCornerShape(14.dp))
                                .padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Text(
                                text = "Любимые жанры",
                                style = MaterialTheme.typography.titleMedium,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )

                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                state.favoriteGenres.forEach { g ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                                    ) {
                                        Text(
                                            text = g.name,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = TextPrimary,
                                            modifier = Modifier.width(140.dp)
                                        )
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(8.dp)
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(Color(0x22FFFFFF))
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxHeight()
                                                    .fillMaxWidth(fraction = (g.pct / 100f).coerceIn(0.05f, 1f))
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(LumiereGold)
                                            )
                                        }
                                        Text(
                                            text = "${g.count}",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = LumiereGold,
                                            modifier = Modifier.width(36.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                if (state.favorites.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = TextMuted, modifier = Modifier.size(40.dp))
                            Text("У вас пока нет фильмов или сериалов в избранном", color = TextSecondary, fontSize = 14.sp)
                        }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(5),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        contentPadding = PaddingValues(bottom = 24.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(state.favorites, key = { it.id }) { title ->
                            MediaCard(
                                title = title,
                                posterUrl = viewModel.resolvePosterUrl(title.poster).orEmpty(),
                                onClick = { onTitleClick(title) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceDark)
            .border(1.dp, SurfaceBorder, RoundedCornerShape(12.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(Color(0x22E8C170)),
            contentAlignment = Alignment.Center
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = LumiereGold, modifier = Modifier.size(20.dp))
        }

        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = value,
                fontSize = if (value.length > 12) 15.sp else 19.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
            )
            Text(
                text = label,
                fontSize = 11.sp,
                color = TextSecondary,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
            )
        }
    }
}

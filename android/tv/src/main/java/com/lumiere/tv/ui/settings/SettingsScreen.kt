package com.lumiere.tv.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import com.lumiere.core.storage.AppPreferences
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateDestination: (TvNavDestination) -> Unit,
    onChangeServerClick: () -> Unit,
    onSwitchProfileClick: () -> Unit,
    onNotificationsClick: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val preferences = remember { AppPreferences(context) }

    var serverUrl by remember { mutableStateOf("") }
    var profileName by remember { mutableStateOf("Пользователь") }
    val settingsFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }

    LaunchedEffect(Unit) {
        serverUrl = preferences.serverUrl.first().orEmpty()
        kotlinx.coroutines.delay(80)
        try {
            settingsFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        TvTopBar(
            currentDestination = TvNavDestination.SETTINGS,
            firstItemFocusRequester = settingsFocusRequester,
            onNavigate = onNavigateDestination,
            profileName = profileName,
            profileAvatar = null,
            onProfileClick = onSwitchProfileClick,
            onNotificationsClick = onNotificationsClick
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 48.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(bottom = 48.dp)
        ) {
            item {
                Text(
                    text = "Настройки приложения",
                    style = MaterialTheme.typography.headlineMedium,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

            // Server Card
            item {
                SettingCard(
                    icon = Icons.Default.Dns,
                    title = "Сервер Lumiere",
                    subtitle = if (serverUrl.isNotBlank()) serverUrl else "Не подключен",
                    actionLabel = "Сменить сервер",
                    onAction = onChangeServerClick
                )
            }

            // Profile Card
            item {
                SettingCard(
                    icon = Icons.Default.AccountCircle,
                    title = "Текущий профиль",
                    subtitle = profileName,
                    actionLabel = "Сменить профиль",
                    onAction = onSwitchProfileClick
                )
            }

            // Playback Options
            item {
                SettingCard(
                    icon = Icons.Default.Speed,
                    title = "Движок воспроизведения",
                    subtitle = "Google Media3 ExoPlayer • Аппаратное декодирование включено",
                    actionLabel = "Оптимизировано",
                    onAction = {}
                )
            }

            // TorrServer Streaming
            item {
                SettingCard(
                    icon = Icons.Default.Download,
                    title = "Торрент-движок (TorrServer)",
                    subtitle = "Прямой поток без ожидания • Защита от OOM RAM",
                    actionLabel = "Активно",
                    onAction = {}
                )
            }

            // App Version Info
            item {
                SettingCard(
                    icon = Icons.Default.Info,
                    title = "О приложении",
                    subtitle = "Lumiere TV v1.0.0 Native • Jetpack Compose for TV • Android TV",
                    actionLabel = "Обновлений нет",
                    onAction = {}
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SettingCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    Card(
        onClick = onAction,
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp),
        colors = CardDefaults.colors(
            containerColor = SurfaceVariantDark,
            focusedContainerColor = SurfaceDark
        ),
        shape = CardDefaults.shape(RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1f),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(2.5.dp, LumiereGold),
                shape = RoundedCornerShape(12.dp)
            ),
            border = Border(
                border = androidx.compose.foundation.BorderStroke(1.dp, SurfaceBorder),
                shape = RoundedCornerShape(12.dp)
            )
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = LumiereGold,
                    modifier = Modifier.size(28.dp)
                )

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                }
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0x22E8C170))
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Text(
                    text = actionLabel,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = LumiereGold
                )
            }
        }
    }
}

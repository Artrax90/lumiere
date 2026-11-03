package com.lumiere.tv.ui.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.*
import com.lumiere.core.model.HomeShelfItem
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
    var preferredVoiceover by remember { mutableStateOf("") }
    var homeShelves by remember { mutableStateOf<List<HomeShelfItem>>(emptyList()) }

    var showVoiceoverDialog by remember { mutableStateOf(false) }
    var showShelvesDialog by remember { mutableStateOf(false) }

    val settingsFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        serverUrl = preferences.serverUrl.first().orEmpty()
        preferredVoiceover = preferences.getPreferredVoiceover()
        homeShelves = preferences.getHomeShelves()
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

            // Preferred Voiceover
            item {
                SettingCard(
                    icon = Icons.Default.RecordVoiceOver,
                    title = "Предпочтительная озвучка",
                    subtitle = if (preferredVoiceover.isNotBlank()) preferredVoiceover else "Любая (без предпочтений)",
                    actionLabel = "Выбрать",
                    onAction = { showVoiceoverDialog = true }
                )
            }

            // Home Shelves Customization
            item {
                SettingCard(
                    icon = Icons.Default.DashboardCustomize,
                    title = "Полки на главном экране",
                    subtitle = "Настройка порядка и видимости полок",
                    actionLabel = "Настроить",
                    onAction = { showShelvesDialog = true }
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
                    subtitle = "Lumiere TV v2.0 Native • Jetpack Compose for TV • Android TV",
                    actionLabel = "Актуальная",
                    onAction = {}
                )
            }
        }
    }

    // Voiceover Selection Dialog
    if (showVoiceoverDialog) {
        VoiceoverSelectionDialog(
            currentVoiceover = preferredVoiceover,
            onSelect = { voiceover ->
                preferredVoiceover = voiceover
                showVoiceoverDialog = false
                scope.launch {
                    preferences.setPreferredVoiceover(voiceover)
                }
            },
            onDismiss = { showVoiceoverDialog = false }
        )
    }

    // Home Shelves Customization Dialog
    if (showShelvesDialog) {
        HomeShelvesDialog(
            shelves = homeShelves,
            onShelvesChange = { updated ->
                homeShelves = updated
                scope.launch {
                    preferences.saveHomeShelves(updated)
                }
            },
            onDismiss = { showShelvesDialog = false }
        )
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
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1.02f),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, LumiereGold),
                shape = RoundedCornerShape(12.dp)
            ),
            border = Border(
                border = BorderStroke(1.dp, SurfaceBorder),
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

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun VoiceoverSelectionDialog(
    currentVoiceover: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val voiceoverOptions = remember {
        listOf(
            "" to "Любая (без предпочтений)",
            "Дубляж" to "Дубляж (Профессиональный)",
            "Red Head Sound" to "Red Head Sound (RHS)",
            "LostFilm" to "LostFilm",
            "HDRezka" to "HDRezka Studio",
            "Кубик в Кубе" to "Кубик в Кубе",
            "Пифагор" to "Пифагор",
            "NewStudio" to "NewStudio",
            "TVShows" to "TVShows",
            "Кураж-Бамбей" to "Кураж-Бамбей",
            "Jaskier" to "Jaskier",
            "AlexFilm" to "AlexFilm"
        )
    }

    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(60)
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.65f)
                .fillMaxHeight(0.85f)
                .clip(RoundedCornerShape(16.dp))
                .background(BackgroundDark)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                .padding(24.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "Предпочтительная озвучка",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Text(
                            text = "Раздачи с этой студией будут помечены ⭐ и подняты в топ списка",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }

                    OutlinedButton(
                        onClick = onDismiss,
                        shape = OutlinedButtonDefaults.shape(RoundedCornerShape(8.dp)),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("Закрыть", fontSize = 12.sp)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(voiceoverOptions) { idx, (key, label) ->
                        val isSelected = (key.isBlank() && currentVoiceover.isBlank()) ||
                                         (key.isNotBlank() && currentVoiceover.contains(key, ignoreCase = true))
                        val btnShape = RoundedCornerShape(10.dp)
                        val btnModifier = if (idx == 0) {
                            Modifier
                                .fillMaxWidth()
                                .focusRequester(firstFocus)
                        } else {
                            Modifier.fillMaxWidth()
                        }

                        Button(
                            onClick = { onSelect(key) },
                            modifier = btnModifier,
                            scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.02f),
                            colors = ButtonDefaults.colors(
                                containerColor = if (isSelected) Color(0x33E5A93C) else SurfaceVariantDark,
                                contentColor = if (isSelected) LumiereGold else TextPrimary,
                                focusedContainerColor = LumiereGold,
                                focusedContentColor = BackgroundDark
                            ),
                            border = ButtonDefaults.border(
                                focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = btnShape),
                                border = Border(
                                    border = BorderStroke(
                                        width = 1.dp,
                                        color = if (isSelected) LumiereGold.copy(alpha = 0.5f) else Color(0x18FFFFFF)
                                    ),
                                    shape = btnShape
                                )
                            ),
                            shape = ButtonDefaults.shape(btnShape),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 14.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                                if (isSelected) {
                                    Text("✓ Выбрано", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun HomeShelvesDialog(
    shelves: List<HomeShelfItem>,
    onShelvesChange: (List<HomeShelfItem>) -> Unit,
    onDismiss: () -> Unit
) {
    var list by remember(shelves) { mutableStateOf(shelves) }
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(60)
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.7f)
                .fillMaxHeight(0.85f)
                .clip(RoundedCornerShape(16.dp))
                .background(BackgroundDark)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                .padding(24.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "Полки на главном экране",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Text(
                            text = "Включайте нужные разделы и настраивайте их порядок отображения",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }

                    OutlinedButton(
                        onClick = onDismiss,
                        shape = OutlinedButtonDefaults.shape(RoundedCornerShape(8.dp)),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("Готово", fontSize = 12.sp)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(list, key = { _, it -> it.id }) { idx, item ->
                        val itemShape = RoundedCornerShape(10.dp)
                        Card(
                            onClick = {
                                val updated = list.toMutableList()
                                updated[idx] = item.copy(enabled = !item.enabled)
                                list = updated
                                onShelvesChange(updated)
                            },
                            modifier = if (idx == 0) Modifier.fillMaxWidth().focusRequester(firstFocus) else Modifier.fillMaxWidth(),
                            colors = CardDefaults.colors(
                                containerColor = if (item.enabled) SurfaceVariantDark else Color(0x10FFFFFF),
                                focusedContainerColor = SurfaceDark
                            ),
                            shape = CardDefaults.shape(itemShape),
                            border = CardDefaults.border(
                                focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = itemShape),
                                border = Border(border = BorderStroke(1.dp, Color(0x18FFFFFF)), shape = itemShape)
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Icon(
                                        imageVector = if (item.enabled) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                        contentDescription = null,
                                        tint = if (item.enabled) LumiereGold else TextMuted,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Text(
                                        text = item.label,
                                        fontSize = 14.sp,
                                        color = if (item.enabled) TextPrimary else TextMuted,
                                        fontWeight = if (item.enabled) FontWeight.Medium else FontWeight.Normal
                                    )
                                }

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    // Move Up
                                    if (idx > 0) {
                                        OutlinedButton(
                                            onClick = {
                                                val updated = list.toMutableList()
                                                val temp = updated[idx - 1]
                                                updated[idx - 1] = updated[idx]
                                                updated[idx] = temp
                                                list = updated
                                                onShelvesChange(updated)
                                            },
                                            shape = OutlinedButtonDefaults.shape(RoundedCornerShape(6.dp)),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                        ) {
                                            Text("▲", fontSize = 11.sp, color = LumiereGold)
                                        }
                                    }

                                    // Move Down
                                    if (idx < list.size - 1) {
                                        OutlinedButton(
                                            onClick = {
                                                val updated = list.toMutableList()
                                                val temp = updated[idx + 1]
                                                updated[idx + 1] = updated[idx]
                                                updated[idx] = temp
                                                list = updated
                                                onShelvesChange(updated)
                                            },
                                            shape = OutlinedButtonDefaults.shape(RoundedCornerShape(6.dp)),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                        ) {
                                            Text("▼", fontSize = 11.sp, color = LumiereGold)
                                        }
                                    }

                                    // Toggle Status Badge
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(if (item.enabled) Color(0x3322C55E) else Color(0x22EF4444))
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = if (item.enabled) "Вкл" else "Выкл",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (item.enabled) Color(0xFF4ADE80) else Color(0xFFF87171)
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

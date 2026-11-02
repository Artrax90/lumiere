package com.lumiere.tv.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.AppNotification
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onBackClick: () -> Unit,
    onTitleClick: (mediaId: Long, mediaType: String) -> Unit,
    viewModel: NotificationsViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(horizontal = 48.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Top Navigation Bar
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

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.NotificationsActive,
                        contentDescription = null,
                        tint = LumiereGold,
                        modifier = Modifier.size(24.dp)
                    )
                    Text(
                        text = "Уведомления о релизах",
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary
                    )
                    if (state.unreadCount > 0) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(LumiereGold)
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "${state.unreadCount} новых",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = BackgroundDark
                            )
                        }
                    }
                }
            }

            if (state.notifications.any { !it.isRead }) {
                Button(
                    onClick = { viewModel.markAllRead() },
                    colors = ButtonDefaults.colors(
                        containerColor = SurfaceDark,
                        contentColor = TextSecondary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.DoneAll, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Прочитать все", fontSize = 12.sp)
                }
            }
        }

        // Main Content Area
        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
            if (state.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "Загрузка уведомлений...",
                        style = MaterialTheme.typography.titleMedium,
                        color = LumiereGold
                    )
                }
            } else if (state.notifications.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.width(500.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Notifications,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Text(
                            text = "У вас пока нет уведомлений",
                            style = MaterialTheme.typography.titleMedium,
                            color = TextPrimary
                        )
                        Text(
                            text = "Нажмите «🔔 Следить за новыми сериями / релизом» на странице фильма или сериала, чтобы автоматически получать уведомления о выходе новых серий и цифровых релизов в чистом звуке.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextSecondary,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 32.dp)
                ) {
                    items(state.notifications, key = { it.id }) { notif ->
                        NotificationCard(
                            notification = notif,
                            posterUrl = viewModel.resolvePosterUrl(notif.poster),
                            onClick = {
                                viewModel.markRead(notif.id)
                                val mId = notif.mediaId ?: 0L
                                val mType = notif.mediaType ?: "movie"
                                if (mId > 0L) {
                                    onTitleClick(mId, mType)
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun NotificationCard(
    notification: AppNotification,
    posterUrl: String?,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.colors(
            containerColor = if (!notification.isRead) SurfaceVariantDark else SurfaceDark,
            contentColor = TextPrimary,
            focusedContainerColor = LumiereGold,
            focusedContentColor = BackgroundDark
        ),
        shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
        contentPadding = PaddingValues(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Poster thumbnail
            Box(
                modifier = Modifier
                    .width(48.dp)
                    .height(68.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(BackgroundDark),
                contentAlignment = Alignment.Center
            ) {
                if (!posterUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = posterUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = null,
                        tint = LumiereGold,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }

            // Text Info
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = notification.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )

                    if (!notification.isRead) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(LumiereGold)
                        )
                    }
                }

                Text(
                    text = notification.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextPrimary
                )

                val created = notification.createdAt
                if (!created.isNullOrBlank()) {
                    Text(
                        text = created.take(16).replace("T", " "),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextMuted
                    )
                }
            }
        }
    }
}

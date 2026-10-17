package com.lumiere.tv.ui.my

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.MediaCard
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MyScreen(
    onTitleClick: (Title) -> Unit,
    onNavigateDestination: (TvNavDestination) -> Unit,
    onProfileClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    viewModel: MyViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val myFocusRequester = androidx.compose.runtime.remember { androidx.compose.ui.focus.FocusRequester() }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(80)
        try { myFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        TvTopBar(
            currentDestination = TvNavDestination.MY,
            firstItemFocusRequester = myFocusRequester,
            onNavigate = onNavigateDestination,
            profileName = "Lumiere",
            profileAvatar = null,
            onProfileClick = onProfileClick,
            onNotificationsClick = onNotificationsClick
        )

        // Tab Selector Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MyTab.entries.forEach { tab ->
                val isSelected = tab == uiState.selectedTab
                Button(
                    onClick = { viewModel.selectTab(tab) },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isSelected) LumiereGold else SurfaceVariantDark,
                        contentColor = if (isSelected) BackgroundDark else TextSecondary,
                        focusedContainerColor = Color.White,
                        focusedContentColor = BackgroundDark
                    ),
                    shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = tab.title,
                        fontSize = 13.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        }

        // Content
        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Загрузка...",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiereGold
                )
            }
        } else if (uiState.items.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = when (uiState.selectedTab) {
                        MyTab.HISTORY -> "История просмотров пока пуста"
                        MyTab.WATCHLIST -> "В списке «Буду смотреть» пока ничего нет"
                        MyTab.FAVORITES -> "В «Избранном» пока ничего нет"
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = TextSecondary
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 140.dp),
                contentPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 8.dp, bottom = 48.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                itemsIndexed(
                    items = uiState.items,
                    key = { index, title -> "${title.id}_$index" }
                ) { _, title ->
                    MediaCard(
                        title = title,
                        posterUrl = viewModel.resolvePosterUrl(title.poster),
                        onClick = { onTitleClick(title) }
                    )
                }
            }
        }
    }
}

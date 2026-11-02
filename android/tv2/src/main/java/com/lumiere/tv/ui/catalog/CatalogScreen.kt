package com.lumiere.tv.ui.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.*
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.MediaCard
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CatalogScreen(
    mediaType: String,
    titleName: String,
    onTitleClick: (Title) -> Unit,
    onNavigateDestination: (TvNavDestination) -> Unit,
    onProfileClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    viewModel: CatalogViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val gridState = rememberLazyGridState()

    // Trigger next page when scrolling near end
    LaunchedEffect(gridState) {
        snapshotFlow { gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index }
            .collect { lastIndex ->
                if (lastIndex != null && lastIndex >= uiState.titles.size - 6) {
                    viewModel.loadNextPage()
                }
            }
    }

    val catalogFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(80)
        try { catalogFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // Persistent Top Bar
        TvTopBar(
            currentDestination = if (mediaType == "tv") TvNavDestination.SERIES else TvNavDestination.MOVIES,
            firstItemFocusRequester = catalogFocusRequester,
            onNavigate = onNavigateDestination,
            profileName = "Lumiere",
            profileAvatar = null,
            onProfileClick = onProfileClick,
            onNotificationsClick = onNotificationsClick
        )

        // Genre Filter Chips
        LazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            item(key = "all") {
                val isSelected = uiState.selectedGenreId == null
                Button(
                    onClick = { viewModel.selectGenre(null) },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isSelected) LumiereGold else SurfaceDark,
                        contentColor = if (isSelected) BackgroundDark else TextSecondary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Text("Все $titleName", style = MaterialTheme.typography.labelLarge)
                }
            }

            items(uiState.genres, key = { it.id }) { genre ->
                val isSelected = uiState.selectedGenreId == genre.id
                Button(
                    onClick = { viewModel.selectGenre(genre.id) },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isSelected) LumiereGold else SurfaceDark,
                        contentColor = if (isSelected) BackgroundDark else TextSecondary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Text(genre.name, style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Grid of Media Cards
        val resolvePoster = remember(viewModel) {
            { path: String? -> viewModel.resolvePosterUrl(path) }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 150.dp),
                state = gridState,
                contentPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 8.dp, bottom = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                itemsIndexed(
                    items = uiState.titles,
                    key = { index, title -> "${title.id}_${title.type}_$index" },
                    contentType = { _, _ -> "media_card" }
                ) { _, title ->
                    MediaCard(
                        title = title,
                        posterUrl = resolvePoster(title.poster),
                        onClick = { onTitleClick(title) }
                    )
                }
            }

            if (uiState.isLoading && uiState.titles.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Загрузка каталога...",
                        style = MaterialTheme.typography.titleMedium,
                        color = LumiereGold
                    )
                }
            }
        }
    }
}

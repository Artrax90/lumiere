package com.lumiere.tv.ui.catalog

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

    val firstGenreFocusRequester = remember { FocusRequester() }
    val firstSortFocusRequester = remember { FocusRequester() }
    val firstGridFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(80)
        try { firstGenreFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // Persistent Top Bar
        TvTopBar(
            currentDestination = if (mediaType == "tv") TvNavDestination.SERIES else TvNavDestination.MOVIES,
            firstItemFocusRequester = firstGenreFocusRequester,
            downFocusRequester = firstGenreFocusRequester,
            onNavigate = onNavigateDestination,
            profileName = "Lumiere",
            profileAvatar = null,
            onProfileClick = onProfileClick,
            onNotificationsClick = onNotificationsClick
        )

        // 1. Genre Filter Chips Row
        LazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            item(key = "all_genres") {
                val isSelected = uiState.selectedGenreId == null
                val chipShape = RoundedCornerShape(10.dp)
                Button(
                    onClick = { viewModel.selectGenre(null) },
                    modifier = Modifier
                        .focusRequester(firstGenreFocusRequester)
                        .focusProperties {
                            down = firstSortFocusRequester
                        },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isSelected) LumiereGold else Color(0x18FFFFFF),
                        contentColor = if (isSelected) BackgroundDark else TextPrimary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = chipShape),
                        border = Border(
                            border = BorderStroke(
                                width = if (isSelected) 1.5.dp else 0.5.dp,
                                color = if (isSelected) LumiereGold else Color(0x22FFFFFF)
                            ),
                            shape = chipShape
                        )
                    ),
                    shape = ButtonDefaults.shape(chipShape),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text(
                        "Все $titleName",
                        fontSize = 13.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                    )
                }
            }

            items(uiState.genres, key = { it.id }) { genre ->
                val isSelected = uiState.selectedGenreId == genre.id
                val chipShape = RoundedCornerShape(10.dp)
                Button(
                    onClick = { viewModel.selectGenre(genre.id) },
                    modifier = Modifier.focusProperties {
                        down = firstSortFocusRequester
                    },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isSelected) LumiereGold else Color(0x18FFFFFF),
                        contentColor = if (isSelected) BackgroundDark else TextPrimary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = chipShape),
                        border = Border(
                            border = BorderStroke(
                                width = if (isSelected) 1.5.dp else 0.5.dp,
                                color = if (isSelected) LumiereGold else Color(0x22FFFFFF)
                            ),
                            shape = chipShape
                        )
                    ),
                    shape = ButtonDefaults.shape(chipShape),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text(
                        genre.name,
                        fontSize = 13.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                    )
                }
            }
        }

        // 2. Secondary Filter Row (Sort & Years)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            // Sort Options
            uiState.sortOptions.forEachIndexed { idx, sort ->
                item(key = sort.id) {
                    val isSelected = uiState.selectedSort == sort.id
                    val chipShape = RoundedCornerShape(8.dp)
                    Button(
                        onClick = { viewModel.selectSort(sort.id) },
                        modifier = if (idx == 0) {
                            Modifier
                                .focusRequester(firstSortFocusRequester)
                                .focusProperties {
                                    up = firstGenreFocusRequester
                                    down = firstGridFocusRequester
                                }
                        } else {
                            Modifier.focusProperties {
                                up = firstGenreFocusRequester
                                down = firstGridFocusRequester
                            }
                        },
                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                        colors = ButtonDefaults.colors(
                            containerColor = if (isSelected) Color(0x33E5A93C) else Color(0x12FFFFFF),
                            contentColor = if (isSelected) LumiereGold else TextSecondary,
                            focusedContainerColor = LumiereGold,
                            focusedContentColor = BackgroundDark
                        ),
                        border = ButtonDefaults.border(
                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = chipShape),
                            border = Border(
                                border = BorderStroke(
                                    width = 1.dp,
                                    color = if (isSelected) LumiereGold.copy(alpha = 0.6f) else Color(0x1AFFFFFF)
                                ),
                                shape = chipShape
                            )
                        ),
                        shape = ButtonDefaults.shape(chipShape),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text(
                            sort.title,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }
            }

            // Divider between Sort and Years
            item(key = "divider") {
                Box(
                    modifier = Modifier
                        .height(18.dp)
                        .width(1.dp)
                        .background(Color(0x33FFFFFF))
                )
            }

            // Year Options
            items(uiState.availableYears, key = { it ?: 0 }) { year ->
                val isSelected = uiState.selectedYear == year
                val chipShape = RoundedCornerShape(8.dp)
                Button(
                    onClick = { viewModel.selectYear(year) },
                    modifier = Modifier.focusProperties {
                        up = firstGenreFocusRequester
                        down = firstGridFocusRequester
                    },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isSelected) Color(0x33E5A93C) else Color(0x12FFFFFF),
                        contentColor = if (isSelected) LumiereGold else TextSecondary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = chipShape),
                        border = Border(
                            border = BorderStroke(
                                width = 1.dp,
                                color = if (isSelected) LumiereGold.copy(alpha = 0.6f) else Color(0x1AFFFFFF)
                            ),
                            shape = chipShape
                        )
                    ),
                    shape = ButtonDefaults.shape(chipShape),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = if (year != null) year.toString() else "Все года",
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

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
                ) { index, title ->
                    val cardModifier = if (index == 0) {
                        Modifier
                            .focusRequester(firstGridFocusRequester)
                            .focusProperties { up = firstSortFocusRequester }
                    } else {
                        Modifier
                    }
                    MediaCard(
                        title = title,
                        posterUrl = resolvePoster(title.poster),
                        onClick = { onTitleClick(title) },
                        modifier = cardModifier
                    )
                }
            }

            if (uiState.isLoading && uiState.titles.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        androidx.compose.material3.CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = LumiereGold,
                            strokeWidth = 2.5.dp
                        )
                        Text(
                            text = "Загрузка каталога...",
                            style = MaterialTheme.typography.titleMedium,
                            color = LumiereGold
                        )
                    }
                }
            } else if (!uiState.isLoading && uiState.titles.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "По выбранным фильтрам ничего не найдено",
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary
                    )
                }
            }
        }
    }
}

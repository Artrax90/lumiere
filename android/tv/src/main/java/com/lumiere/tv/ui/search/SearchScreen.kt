package com.lumiere.tv.ui.search

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.MediaCard
import com.lumiere.tv.ui.components.TvVirtualKeyboard
import kotlinx.coroutines.launch

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(
    onBackClick: () -> Unit,
    onTitleClick: (Title) -> Unit,
    viewModel: SearchViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val gridState = rememberLazyGridState()
    val coroutineScope = rememberCoroutineScope()
    val keyboardFocusRequester = remember { FocusRequester() }
    val resultsFocusRequester = remember { FocusRequester() }

    val shouldLoadMore by remember {
        derivedStateOf {
            val totalItems = gridState.layoutInfo.totalItemsCount
            val lastVisible = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            totalItems > 0 && lastVisible >= totalItems - 6
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            viewModel.loadMoreResults()
        }
    }

    BackHandler {
        if (gridState.firstVisibleItemIndex > 0) {
            coroutineScope.launch {
                gridState.animateScrollToItem(0)
                try {
                    keyboardFocusRequester.requestFocus()
                } catch (_: Exception) {}
            }
        } else if (state.query.isNotBlank()) {
            viewModel.onClear()
        } else {
            onBackClick()
        }
    }

    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(start = 28.dp, end = 28.dp, top = 16.dp, bottom = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // ==========================================
        // LEFT PANE: Search Input, Virtual Keyboard & History
        // ==========================================
        Column(
            modifier = Modifier
                .width(460.dp)
                .fillMaxHeight(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // 1. Top Bar Row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
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
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Назад", style = MaterialTheme.typography.labelMedium)
                }

                Text(
                    text = "Поиск",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold
                )
            }

            // 2. Search Query Box
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(SurfaceDark)
                    .border(
                        1.5.dp,
                        if (state.query.isNotBlank()) LumiereGold else SurfaceBorder,
                        RoundedCornerShape(12.dp)
                    )
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = if (state.query.isNotBlank()) LumiereGold else TextMuted,
                        modifier = Modifier.size(18.dp)
                    )

                    Text(
                        text = if (state.query.isBlank()) "Введите название фильма или сериала..." else state.query,
                        color = if (state.query.isBlank()) TextMuted else TextPrimary,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )

                    if (state.query.isNotBlank()) {
                        Text(
                            text = "|",
                            color = LumiereGold,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )

                        OutlinedButton(
                            onClick = { viewModel.onClear() },
                            colors = OutlinedButtonDefaults.colors(
                                focusedContainerColor = Color(0x33FFFFFF),
                                focusedContentColor = TextPrimary
                            ),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                            modifier = Modifier.height(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Очистить",
                                modifier = Modifier.size(13.dp)
                            )
                        }
                    }
                }
            }

            // 3. Virtual Keyboard (Static & completely fixed on the left)
            TvVirtualKeyboard(
                onChar = { viewModel.onChar(it) },
                onBackspace = { viewModel.onBackspace() },
                onClear = { viewModel.onClear() },
                onSpace = { viewModel.onSpace() },
                firstKeyFocusRequester = keyboardFocusRequester,
                modifier = Modifier.fillMaxWidth()
            )

            // 4. Quick Jump to Results Button (if results exist)
            if (state.results.isNotEmpty()) {
                val jumpShape = RoundedCornerShape(10.dp)
                Button(
                    onClick = {
                        coroutineScope.launch {
                            try {
                                resultsFocusRequester.requestFocus()
                            } catch (_: Exception) {}
                        }
                    },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.03f),
                    colors = ButtonDefaults.colors(
                        containerColor = Color(0x33E8C170),
                        contentColor = LumiereGold,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        border = Border(border = BorderStroke(1.dp, LumiereGold.copy(alpha = 0.5f)), shape = jumpShape),
                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = jumpShape)
                    ),
                    shape = ButtonDefaults.shape(jumpShape),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(38.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "К найденным фильмам (${state.results.size})  →",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // 5. Search History Chips (under the keyboard)
            if (state.searchHistory.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.History,
                                contentDescription = null,
                                tint = TextMuted,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "История поиска",
                                fontSize = 12.sp,
                                color = TextMuted,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        OutlinedButton(
                            onClick = { viewModel.onClearHistory() },
                            colors = OutlinedButtonDefaults.colors(
                                focusedContainerColor = Color(0x33FF4081),
                                focusedContentColor = Color.White
                            ),
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 1.dp),
                            modifier = Modifier.height(24.dp)
                        ) {
                            Text("Очистить", fontSize = 10.sp, color = TextMuted)
                        }
                    }

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 4.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(state.searchHistory.take(8)) { queryItem ->
                            val chipShape = RoundedCornerShape(8.dp)
                            Button(
                                onClick = { viewModel.onSelectHistory(queryItem) },
                                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                                colors = ButtonDefaults.colors(
                                    containerColor = Color(0x1AFFFFFF),
                                    contentColor = TextSecondary,
                                    focusedContainerColor = LumiereGold,
                                    focusedContentColor = BackgroundDark
                                ),
                                border = ButtonDefaults.border(
                                    border = Border(border = BorderStroke(1.dp, Color(0x22FFFFFF)), shape = chipShape),
                                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = chipShape)
                                ),
                                shape = ButtonDefaults.shape(chipShape),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier.height(30.dp)
                            ) {
                                Text(
                                    text = queryItem,
                                    fontSize = 12.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // RIGHT PANE: Source Tabs & Results Grid (Full Height!)
        // ==========================================
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // 1. Source Tabs (TMDB & Kinopoisk)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SearchSourceTabButton(
                        title = "TMDB",
                        count = state.tmdbCount,
                        isActive = state.activeSource == "tmdb",
                        onClick = { viewModel.setSource("tmdb") }
                    )

                    SearchSourceTabButton(
                        title = "Кинопоиск",
                        count = state.kpCount,
                        isActive = state.activeSource == "kp",
                        onClick = { viewModel.setSource("kp") }
                    )
                }

                if (state.results.isNotEmpty()) {
                    Text(
                        text = "Найдено: ${state.results.size}",
                        fontSize = 13.sp,
                        color = TextMuted
                    )
                }
            }

            // 2. Results Grid or Status View (Takes remaining full height of screen)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                if (state.isLoading) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Поиск в ${if (state.activeSource == "kp") "Кинопоиске" else "TMDB"}...",
                            style = MaterialTheme.typography.titleMedium,
                            color = LumiereGold
                        )
                    }
                } else if (state.results.isNotEmpty()) {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(135.dp),
                        state = gridState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(top = 4.dp, bottom = 32.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        items(
                            items = state.results,
                            key = { "${it.id}_${it.type ?: "movie"}_${it.source ?: ""}" }
                        ) { title ->
                            val isFirst = title == state.results.firstOrNull()
                            MediaCard(
                                title = title,
                                posterUrl = viewModel.resolvePosterUrl(title.poster),
                                onClick = {
                                    viewModel.recordQuery(state.query)
                                    onTitleClick(title)
                                },
                                modifier = if (isFirst) Modifier.focusRequester(resultsFocusRequester) else Modifier
                            )
                        }

                        if (state.isLoadingMore) {
                            item(span = { GridItemSpan(maxLineSpan) }) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(48.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "Загрузка следующих результатов...",
                                        color = LumiereGold,
                                        fontSize = 13.sp
                                    )
                                }
                            }
                        }
                    }
                } else if (state.query.trim().length >= 2) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.padding(24.dp)
                        ) {
                            Text(
                                text = "По запросу «${state.query}» в ${if (state.activeSource == "kp") "Кинопоиске" else "TMDB"} ничего не найдено",
                                style = MaterialTheme.typography.bodyLarge,
                                color = TextSecondary
                            )
                            if (state.activeSource == "tmdb" && state.kpCount > 0) {
                                Text(
                                    text = "Найдено в Кинопоиске: ${state.kpCount} (нажмите кнопку «Кинопоиск»)",
                                    color = LumiereGold,
                                    fontSize = 14.sp
                                )
                            } else if (state.activeSource == "kp" && state.tmdbCount > 0) {
                                Text(
                                    text = "Найдено в TMDB: ${state.tmdbCount} (нажмите кнопку «TMDB»)",
                                    color = LumiereGold,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                } else {
                    // Empty query state: Large History List or Prompt
                    if (state.searchHistory.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Недавние поисковые запросы",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = TextPrimary,
                                    fontWeight = FontWeight.Bold
                                )

                                OutlinedButton(
                                    onClick = { viewModel.onClearHistory() },
                                    colors = OutlinedButtonDefaults.colors(
                                        focusedContainerColor = Color(0x33FF4081),
                                        focusedContentColor = Color.White
                                    ),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Text("Очистить историю", fontSize = 12.sp, color = TextSecondary)
                                }
                            }

                            LazyVerticalGrid(
                                columns = GridCells.Adaptive(180.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                items(state.searchHistory) { historyItem ->
                                    val histShape = RoundedCornerShape(12.dp)
                                    Button(
                                        onClick = { viewModel.onSelectHistory(historyItem) },
                                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.04f),
                                        colors = ButtonDefaults.colors(
                                            containerColor = SurfaceDark,
                                            contentColor = TextPrimary,
                                            focusedContainerColor = LumiereGold,
                                            focusedContentColor = BackgroundDark
                                        ),
                                        border = ButtonDefaults.border(
                                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = histShape),
                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = histShape)
                                        ),
                                        shape = ButtonDefaults.shape(histShape),
                                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Search,
                                                contentDescription = null,
                                                tint = LumiereGold,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Text(
                                                text = historyItem,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Medium,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Search,
                                    contentDescription = null,
                                    tint = TextMuted,
                                    modifier = Modifier.size(48.dp)
                                )
                                Text(
                                    text = "Используйте пульт для ввода названия на клавиатуре слева",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = TextMuted
                                )
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
private fun SearchSourceTabButton(
    title: String,
    count: Int,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val tabShape = RoundedCornerShape(12.dp)
    Button(
        onClick = onClick,
        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
        colors = ButtonDefaults.colors(
            containerColor = if (isActive) Color(0x33E8C170) else Color(0x18FFFFFF),
            contentColor = if (isActive) LumiereGold else Color.White,
            focusedContainerColor = LumiereGold,
            focusedContentColor = BackgroundDark
        ),
        border = ButtonDefaults.border(
            border = Border(
                border = BorderStroke(
                    width = if (isActive) 1.5.dp else 1.dp,
                    color = if (isActive) LumiereGold else Color(0x33FFFFFF)
                ),
                shape = tabShape
            ),
            focusedBorder = Border(
                border = BorderStroke(2.dp, Color.White),
                shape = tabShape
            )
        ),
        shape = ButtonDefaults.shape(tabShape),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
        modifier = modifier.height(42.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (isActive) Color(0x44E8C170) else Color(0x33000000))
                    .border(
                        1.dp,
                        if (isActive) LumiereGold else Color(0x33FFFFFF),
                        RoundedCornerShape(6.dp)
                    )
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "$count",
                    fontSize = 12.sp,
                    color = if (isActive) LumiereGold else Color(0xFFCCCCCC),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

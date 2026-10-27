package com.lumiere.tv.ui.search

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
        } else {
            onBackClick()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(start = 36.dp, end = 36.dp, top = 16.dp)
    ) {
        // 1. Top Navigation Bar (Fixed, never scrolls)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(bottom = 6.dp)
        ) {
            OutlinedButton(
                onClick = onBackClick,
                colors = OutlinedButtonDefaults.colors(
                    focusedContainerColor = Color(0x22FFFFFF),
                    focusedContentColor = TextPrimary
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
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

        // 2. Query Box & Virtual Keyboard (Centered, Fixed, never scrolls)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.width(640.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Search Query Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(SurfaceDark)
                        .border(
                            1.5.dp,
                            if (state.query.isNotBlank()) LumiereGold else SurfaceBorder,
                            RoundedCornerShape(12.dp)
                        )
                        .padding(horizontal = 16.dp),
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
                            fontSize = 15.sp,
                            modifier = Modifier.weight(1f)
                        )

                        if (state.query.isNotBlank()) {
                            Text(
                                text = "|",
                                color = LumiereGold,
                                fontSize = 16.sp,
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

                // Virtual Keyboard (Rock-solid fixed at the top, keys never jump)
                TvVirtualKeyboard(
                    onChar = { viewModel.onChar(it) },
                    onBackspace = { viewModel.onBackspace() },
                    onClear = { viewModel.onClear() },
                    onSpace = { viewModel.onSpace() },
                    firstKeyFocusRequester = keyboardFocusRequester,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // 3. Search Source Tabs (TMDB & Kinopoisk, Fixed)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
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

        // 4. Results Section (Scrollable, fills remaining screen height)
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
                    columns = GridCells.Fixed(5),
                    state = gridState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 48.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(state.results, key = { "${it.id}_${it.type ?: "movie"}_${it.source ?: ""}" }) { title ->
                        MediaCard(
                            title = title,
                            posterUrl = viewModel.resolvePosterUrl(title.poster),
                            onClick = { onTitleClick(title) }
                        )
                    }

                    if (state.isLoadingMore) {
                        item(span = { GridItemSpan(5) }) {
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
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "По запросу «${state.query}» в ${if (state.activeSource == "kp") "Кинопоиске" else "TMDB"} ничего не найдено",
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextSecondary
                        )
                        if (state.activeSource == "tmdb" && state.kpCount > 0) {
                            Text(
                                text = "Найдено в Кинопоиске: ${state.kpCount} (нажмите кнопку «Кинопоиск» выше)",
                                color = LumiereGold,
                                fontSize = 14.sp
                            )
                        } else if (state.activeSource == "kp" && state.tmdbCount > 0) {
                            Text(
                                text = "Найдено в TMDB: ${state.tmdbCount} (нажмите кнопку «TMDB» выше)",
                                color = LumiereGold,
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            } else {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Используйте пульт для ввода названия на клавиатуре выше",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextMuted
                    )
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
    val tabShape = RoundedCornerShape(14.dp)
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
                    width = if (isActive) 2.dp else 1.dp,
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
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        modifier = modifier.height(46.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isActive) Color(0x44E8C170) else Color(0x33000000))
                    .border(
                        1.dp,
                        if (isActive) LumiereGold else Color(0x33FFFFFF),
                        RoundedCornerShape(8.dp)
                    )
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "$count",
                    fontSize = 13.sp,
                    color = if (isActive) LumiereGold else Color(0xFFCCCCCC),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

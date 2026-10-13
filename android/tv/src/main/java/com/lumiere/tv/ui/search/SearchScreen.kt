package com.lumiere.tv.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.MediaCard
import com.lumiere.tv.ui.components.TvVirtualKeyboard

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(
    onBackClick: () -> Unit,
    onTitleClick: (Title) -> Unit,
    viewModel: SearchViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(horizontal = 36.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // Top Navigation Bar
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
                text = "Поиск фильмов и сериалов",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary
            )
        }

        // Main Search Content (Left: Keyboard & Input, Right: Live Results Grid)
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            // Left Column (Width ~440.dp)
            Column(
                modifier = Modifier.width(440.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Query Text Display Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(SurfaceDark)
                        .border(1.dp, if (state.query.isNotBlank()) LumiereGold else SurfaceBorder, RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = if (state.query.isNotBlank()) LumiereGold else TextMuted
                        )

                        Text(
                            text = if (state.query.isBlank()) "Введите название фильма или сериала..." else state.query,
                            color = if (state.query.isBlank()) TextMuted else TextPrimary,
                            fontSize = 16.sp
                        )
                    }
                }

                // Remote D-pad Virtual Keyboard
                TvVirtualKeyboard(
                    onChar = { viewModel.onChar(it) },
                    onBackspace = { viewModel.onBackspace() },
                    onClear = { viewModel.onClear() },
                    onSpace = { viewModel.onSpace() },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Right Column: Search Results Grid
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
                if (state.isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Поиск...",
                            style = MaterialTheme.typography.titleLarge,
                            color = LumiereGold
                        )
                    }
                } else if (state.results.isNotEmpty()) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(state.results, key = { it.id }) { title ->
                            MediaCard(
                                title = title,
                                posterUrl = viewModel.resolvePosterUrl(title.poster),
                                onClick = { onTitleClick(title) }
                            )
                        }
                    }
                } else if (state.query.trim().length >= 2) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "По запросу «${state.query}» ничего не найдено",
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextSecondary
                        )
                    }
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Используйте пульт для ввода названия",
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextMuted
                        )
                    }
                }
            }
        }
    }
}

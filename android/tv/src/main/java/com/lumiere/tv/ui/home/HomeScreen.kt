package com.lumiere.tv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.BackgroundDark
import com.lumiere.tv.ui.components.*

@Composable
fun HomeScreen(
    onTitleClick: (Title) -> Unit,
    onSearchClick: () -> Unit,
    onIptvClick: () -> Unit,
    onProfileClick: () -> Unit,
    viewModel: HomeViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var currentTab by remember { mutableStateOf(TvNavDestination.HOME) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // Persistent Top Bar
        TvTopBar(
            currentDestination = currentTab,
            onNavigate = { dest ->
                currentTab = dest
                when (dest) {
                    TvNavDestination.SEARCH -> onSearchClick()
                    TvNavDestination.IPTV -> onIptvClick()
                    else -> {}
                }
            },
            profileName = state.profileName,
            profileAvatar = viewModel.resolveImageUrl(state.profileAvatar),
            onProfileClick = onProfileClick
        )

        // Main Scrolling Catalog
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(32.dp),
            contentPadding = PaddingValues(bottom = 48.dp)
        ) {
            // Hero Banner
            val hero = state.heroItem
            if (hero != null && currentTab == TvNavDestination.HOME) {
                item {
                    HeroBanner(
                        title = hero,
                        backdropUrl = viewModel.resolveImageUrl(hero.backdrop),
                        onPlayClick = { onTitleClick(hero) },
                        onDetailsClick = { onTitleClick(hero) },
                        modifier = Modifier.padding(horizontal = 32.dp)
                    )
                }
            }

            // Continue Watching Row
            if (state.continueWatching.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                item {
                    MediaRow(
                        title = "Продолжить просмотр",
                        items = state.continueWatching,
                        resolvePosterUrl = { viewModel.resolveImageUrl(it) },
                        onTitleClick = onTitleClick
                    )
                }
            }

            // Movies filter or Home
            if (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.MOVIES) {
                // Trending Movies
                item {
                    MediaRow(
                        title = "В тренде (Фильмы)",
                        subtitle = "Самое популярное прямо сейчас",
                        items = state.trendingMovies,
                        resolvePosterUrl = { viewModel.resolveImageUrl(it) },
                        onTitleClick = onTitleClick
                    )
                }

                // Popular Movies
                item {
                    MediaRow(
                        title = "Популярные фильмы",
                        items = state.popularMovies,
                        resolvePosterUrl = { viewModel.resolveImageUrl(it) },
                        onTitleClick = onTitleClick
                    )
                }
            }

            // Series filter or Home
            if (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.SERIES) {
                // Trending Series
                item {
                    MediaRow(
                        title = "Популярные сериалы",
                        items = state.trendingSeries,
                        resolvePosterUrl = { viewModel.resolveImageUrl(it) },
                        onTitleClick = onTitleClick
                    )
                }

                // Top Rated Series
                item {
                    MediaRow(
                        title = "Новые сезоны",
                        items = state.popularSeries,
                        resolvePosterUrl = { viewModel.resolveImageUrl(it) },
                        onTitleClick = onTitleClick
                    )
                }
            }
        }
    }
}

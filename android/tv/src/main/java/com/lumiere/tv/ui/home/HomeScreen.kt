package com.lumiere.tv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.BackgroundDark
import com.lumiere.tv.ui.components.*

@Composable
fun HomeScreen(
    onTitleClick: (Title) -> Unit,
    onSearchClick: () -> Unit,
    onIptvClick: () -> Unit,
    onMoviesClick: () -> Unit = {},
    onSeriesClick: () -> Unit = {},
    onCollectionsClick: () -> Unit = {},
    onMyClick: () -> Unit = {},
    onDownloadsClick: () -> Unit = {},
    onSettingsClick: () -> Unit = {},
    onProfileClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    viewModel: HomeViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var currentTab by remember { mutableStateOf(TvNavDestination.HOME) }

    // Persistent row scroll states to prevent destruction/re-measurement when scrolling vertically
    val continueWatchingState = androidx.compose.foundation.lazy.rememberLazyListState()
    val recommendationsState = androidx.compose.foundation.lazy.rememberLazyListState()
    val trendingMoviesState = androidx.compose.foundation.lazy.rememberLazyListState()
    val netflixMoviesState = androidx.compose.foundation.lazy.rememberLazyListState()
    val popularMoviesState = androidx.compose.foundation.lazy.rememberLazyListState()
    val netflixSeriesState = androidx.compose.foundation.lazy.rememberLazyListState()
    val trendingSeriesState = androidx.compose.foundation.lazy.rememberLazyListState()
    val popularSeriesState = androidx.compose.foundation.lazy.rememberLazyListState()

    val coroutineScope = rememberCoroutineScope()

    // Stable lambda for image resolving
    val resolvePosterUrl = remember(viewModel) {
        { path: String? -> viewModel.resolveImageUrl(path) }
    }

    val homeFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(100)
        try {
            homeFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // Persistent Top Bar
        TvTopBar(
            currentDestination = currentTab,
            firstItemFocusRequester = homeFocusRequester,
            onNavigate = { dest ->
                when (dest) {
                    TvNavDestination.HOME -> { currentTab = TvNavDestination.HOME }
                    TvNavDestination.MOVIES -> onMoviesClick()
                    TvNavDestination.SERIES -> onSeriesClick()
                    TvNavDestination.COLLECTIONS -> onCollectionsClick()
                    TvNavDestination.IPTV -> onIptvClick()
                    TvNavDestination.MY -> onMyClick()
                    TvNavDestination.DOWNLOADS -> onDownloadsClick()
                    TvNavDestination.SEARCH -> onSearchClick()
                    TvNavDestination.SETTINGS -> onSettingsClick()
                }
            },
            profileName = state.profileName,
            profileAvatar = resolvePosterUrl(state.profileAvatar),
            onProfileClick = onProfileClick,
            unreadNotificationsCount = state.unreadNotificationsCount,
            onNotificationsClick = onNotificationsClick
        )

        // Main Scrolling Catalog with persistent in-memory rows to eliminate recreation lag and focus crash
        val scrollState = rememberScrollState()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(top = 16.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp)
        ) {

            // Continue Watching Row
            if (state.continueWatching.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                MediaRow(
                    title = "Продолжить просмотр",
                    items = state.continueWatching,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = continueWatchingState
                )
            }

            // Personalized Recommendations: "✨ Вам может понравиться" (based on watched history)
            if (state.recommendations.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                MediaRow(
                    title = "✨ Вам может понравиться",
                    subtitle = "На основе просмотренных вами фильмов и сериалов",
                    items = state.recommendations,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = recommendationsState
                )
            }

            // Movies filter or Home
            if (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.MOVIES) {
                // Trending Movies
                MediaRow(
                    title = "В тренде (Фильмы)",
                    subtitle = "Самое популярное прямо сейчас",
                    items = state.trendingMovies,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = trendingMoviesState
                )

                // Netflix Movies Row with interactive Week / All Time switcher
                if (state.netflixMovies.isNotEmpty()) {
                    val subtitle = if (state.netflixMoviesPeriod == "week") {
                        "Главные кинохиты и оригинальные премьеры этой недели"
                    } else {
                        "Культовые шедевры мирового кино с признанием зрителей"
                    }
                    MediaRow(
                        title = "Топ фильмы Netflix",
                        subtitle = subtitle,
                        items = state.netflixMovies,
                        resolvePosterUrl = resolvePosterUrl,
                        onTitleClick = onTitleClick,
                        badgeText = "NETFLIX",
                        headerAction = {
                            NetflixPeriodSwitcher(
                                selectedPeriod = state.netflixMoviesPeriod,
                                onSelectPeriod = { period ->
                                    viewModel.setNetflixMoviesPeriod(period)
                                    coroutineScope.launch {
                                        try { netflixMoviesState.scrollToItem(0) } catch (_: Exception) {}
                                    }
                                }
                            )
                        },
                        rowState = netflixMoviesState
                    )
                }

                // Popular Movies
                MediaRow(
                    title = "Популярные фильмы",
                    items = state.popularMovies,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = popularMoviesState
                )
            }

            // Series filter or Home
            if (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.SERIES) {
                // Netflix Series Row with interactive Week / All Time switcher
                if (state.netflixSeries.isNotEmpty()) {
                    val subtitle = if (state.netflixSeriesPeriod == "week") {
                        "Горячие тренды и самые обсуждаемые сериалы прямо сейчас"
                    } else {
                        "Легендарные рекордсмены по просмотрам и рейтингу за всё время"
                    }
                    MediaRow(
                        title = "Топ сериалы Netflix",
                        subtitle = subtitle,
                        items = state.netflixSeries,
                        resolvePosterUrl = resolvePosterUrl,
                        onTitleClick = onTitleClick,
                        badgeText = "NETFLIX",
                        headerAction = {
                            NetflixPeriodSwitcher(
                                selectedPeriod = state.netflixSeriesPeriod,
                                onSelectPeriod = { period ->
                                    viewModel.setNetflixSeriesPeriod(period)
                                    coroutineScope.launch {
                                        try { netflixSeriesState.scrollToItem(0) } catch (_: Exception) {}
                                    }
                                }
                            )
                        },
                        rowState = netflixSeriesState
                    )
                }

                // Trending Series
                MediaRow(
                    title = "Популярные сериалы",
                    items = state.trendingSeries,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = trendingSeriesState
                )

                // Top Rated Series
                MediaRow(
                    title = "Новые сезоны",
                    items = state.popularSeries,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = popularSeriesState
                )
            }
        }
    }
}

package com.lumiere.tv.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
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
    val continueWatchingFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val recommendationsFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val trendingMoviesFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val netflixMoviesFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val popularMoviesFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val netflixSeriesFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val trendingSeriesFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val popularSeriesFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    var isTopBarFocused by remember { mutableStateOf(false) }

    androidx.activity.compose.BackHandler(enabled = !isTopBarFocused) {
        try {
            homeFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                viewModel.refreshWatchHistory()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(100)
        try {
            homeFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    // Main Scrolling Catalog with persistent in-memory rows to eliminate recreation lag and focus crash
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        val (activeFirstRowState, activeFirstRowFocusRequester) = when {
            state.continueWatching.isNotEmpty() && currentTab == TvNavDestination.HOME ->
                continueWatchingState to continueWatchingFocusRequester
            state.recommendations.isNotEmpty() && currentTab == TvNavDestination.HOME ->
                recommendationsState to recommendationsFocusRequester
            (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.MOVIES) && state.trendingMovies.isNotEmpty() ->
                trendingMoviesState to trendingMoviesFocusRequester
            (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.MOVIES) && state.netflixMovies.isNotEmpty() ->
                netflixMoviesState to netflixMoviesFocusRequester
            (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.MOVIES) && state.popularMovies.isNotEmpty() ->
                popularMoviesState to popularMoviesFocusRequester
            (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.SERIES) && state.netflixSeries.isNotEmpty() ->
                netflixSeriesState to netflixSeriesFocusRequester
            (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.SERIES) && state.trendingSeries.isNotEmpty() ->
                trendingSeriesState to trendingSeriesFocusRequester
            (currentTab == TvNavDestination.HOME || currentTab == TvNavDestination.SERIES) && state.popularSeries.isNotEmpty() ->
                popularSeriesState to popularSeriesFocusRequester
            else -> null to null
        }

        // Persistent Top Bar
        Box(
            modifier = Modifier.onFocusChanged { focusState ->
                isTopBarFocused = focusState.hasFocus
            }
        ) {
            TvTopBar(
                currentDestination = currentTab,
                firstItemFocusRequester = homeFocusRequester,
                downFocusRequester = activeFirstRowFocusRequester,
                onDownFromTopBar = {
                    coroutineScope.launch {
                        if (scrollState.value > 0) {
                            scrollState.scrollTo(0)
                        }
                        if (activeFirstRowState != null && activeFirstRowState.firstVisibleItemIndex > 0) {
                            activeFirstRowState.scrollToItem(0)
                        }
                        try {
                            activeFirstRowFocusRequester?.requestFocus()
                        } catch (_: Exception) {}
                    }
                },
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
        }

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
                    rowState = continueWatchingState,
                    firstItemFocusRequester = continueWatchingFocusRequester,
                    upFocusRequester = homeFocusRequester
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
                    rowState = recommendationsState,
                    firstItemFocusRequester = recommendationsFocusRequester,
                    upFocusRequester = homeFocusRequester
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
                    rowState = trendingMoviesState,
                    firstItemFocusRequester = trendingMoviesFocusRequester,
                    upFocusRequester = homeFocusRequester
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
                        rowState = netflixMoviesState,
                        firstItemFocusRequester = netflixMoviesFocusRequester,
                        upFocusRequester = homeFocusRequester
                    )
                }

                // Popular Movies
                MediaRow(
                    title = "Популярные фильмы",
                    items = state.popularMovies,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = popularMoviesState,
                    firstItemFocusRequester = popularMoviesFocusRequester,
                    upFocusRequester = homeFocusRequester
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
                        rowState = netflixSeriesState,
                        firstItemFocusRequester = netflixSeriesFocusRequester,
                        upFocusRequester = homeFocusRequester
                    )
                }

                // Trending Series
                MediaRow(
                    title = "Популярные сериалы",
                    items = state.trendingSeries,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = trendingSeriesState,
                    firstItemFocusRequester = trendingSeriesFocusRequester,
                    upFocusRequester = homeFocusRequester
                )

                // Top Rated Series
                MediaRow(
                    title = "Новые сезоны",
                    items = state.popularSeries,
                    resolvePosterUrl = resolvePosterUrl,
                    onTitleClick = onTitleClick,
                    rowState = popularSeriesState,
                    firstItemFocusRequester = popularSeriesFocusRequester,
                    upFocusRequester = homeFocusRequester
                )
            }
        }
    }
}

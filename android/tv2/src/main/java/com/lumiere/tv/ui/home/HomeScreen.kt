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
        val enabledShelves = remember(state.shelves) {
            val list = state.shelves.filter { it.enabled }
            if (list.isNotEmpty()) list else listOf(
                com.lumiere.core.model.HomeShelfItem("continueWatching", "Продолжить просмотр", true),
                com.lumiere.core.model.HomeShelfItem("recommendations", "✨ Вам может понравиться", true),
                com.lumiere.core.model.HomeShelfItem("trendingMovies", "В тренде (Фильмы)", true),
                com.lumiere.core.model.HomeShelfItem("netflixMovies", "Топ фильмы Netflix", true),
                com.lumiere.core.model.HomeShelfItem("popularMovies", "Популярные фильмы", true),
                com.lumiere.core.model.HomeShelfItem("netflixTv", "Топ сериалы Netflix", true),
                com.lumiere.core.model.HomeShelfItem("trendingTv", "Популярные сериалы", true),
                com.lumiere.core.model.HomeShelfItem("popularTv", "Новые сезоны", true)
            )
        }

        val (activeFirstRowState, activeFirstRowFocusRequester) = run {
            for (shelf in enabledShelves) {
                when (shelf.id) {
                    "continueWatching" -> if (state.continueWatching.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                        return@run continueWatchingState to continueWatchingFocusRequester
                    }
                    "recommendations" -> if (state.recommendations.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                        return@run recommendationsState to recommendationsFocusRequester
                    }
                    "trendingMovies" -> if (state.trendingMovies.isNotEmpty()) {
                        return@run trendingMoviesState to trendingMoviesFocusRequester
                    }
                    "netflixMovies" -> if (state.netflixMovies.isNotEmpty()) {
                        return@run netflixMoviesState to netflixMoviesFocusRequester
                    }
                    "popularMovies" -> if (state.popularMovies.isNotEmpty()) {
                        return@run popularMoviesState to popularMoviesFocusRequester
                    }
                    "netflixTv" -> if (state.netflixSeries.isNotEmpty()) {
                        return@run netflixSeriesState to netflixSeriesFocusRequester
                    }
                    "trendingTv" -> if (state.trendingSeries.isNotEmpty()) {
                        return@run trendingSeriesState to trendingSeriesFocusRequester
                    }
                    "popularTv" -> if (state.popularSeries.isNotEmpty()) {
                        return@run popularSeriesState to popularSeriesFocusRequester
                    }
                }
            }
            null to null
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
            enabledShelves.forEach { shelf ->
                when (shelf.id) {
                    "continueWatching" -> {
                        if (state.continueWatching.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                            MediaRow(
                                title = shelf.label.ifBlank { "Продолжить просмотр" },
                                items = state.continueWatching,
                                resolvePosterUrl = resolvePosterUrl,
                                onTitleClick = onTitleClick,
                                rowState = continueWatchingState,
                                firstItemFocusRequester = continueWatchingFocusRequester,
                                upFocusRequester = homeFocusRequester
                            )
                        }
                    }

                    "recommendations" -> {
                        if (state.recommendations.isNotEmpty() && currentTab == TvNavDestination.HOME) {
                            MediaRow(
                                title = shelf.label.ifBlank { "✨ Вам может понравиться" },
                                subtitle = "На основе просмотренных вами фильмов и сериалов",
                                items = state.recommendations,
                                resolvePosterUrl = resolvePosterUrl,
                                onTitleClick = onTitleClick,
                                rowState = recommendationsState,
                                firstItemFocusRequester = recommendationsFocusRequester,
                                upFocusRequester = homeFocusRequester
                            )
                        }
                    }

                    "trendingMovies" -> {
                        if (state.trendingMovies.isNotEmpty()) {
                            MediaRow(
                                title = shelf.label.ifBlank { "В тренде (Фильмы)" },
                                subtitle = "Самое популярное прямо сейчас",
                                items = state.trendingMovies,
                                resolvePosterUrl = resolvePosterUrl,
                                onTitleClick = onTitleClick,
                                rowState = trendingMoviesState,
                                firstItemFocusRequester = trendingMoviesFocusRequester,
                                upFocusRequester = homeFocusRequester
                            )
                        }
                    }

                    "netflixMovies" -> {
                        if (state.netflixMovies.isNotEmpty()) {
                            val subtitle = if (state.netflixMoviesPeriod == "week") {
                                "Главные кинохиты и оригинальные премьеры этой недели"
                            } else {
                                "Культовые шедевры мирового кино с признанием зрителей"
                            }
                            MediaRow(
                                title = shelf.label.ifBlank { "Топ фильмы Netflix" },
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
                    }

                    "popularMovies" -> {
                        if (state.popularMovies.isNotEmpty()) {
                            MediaRow(
                                title = shelf.label.ifBlank { "Популярные фильмы" },
                                items = state.popularMovies,
                                resolvePosterUrl = resolvePosterUrl,
                                onTitleClick = onTitleClick,
                                rowState = popularMoviesState,
                                firstItemFocusRequester = popularMoviesFocusRequester,
                                upFocusRequester = homeFocusRequester
                            )
                        }
                    }

                    "netflixTv" -> {
                        if (state.netflixSeries.isNotEmpty()) {
                            val subtitle = if (state.netflixSeriesPeriod == "week") {
                                "Горячие тренды и самые обсуждаемые сериалы прямо сейчас"
                            } else {
                                "Легендарные рекордсмены по просмотрам и рейтингу за всё время"
                            }
                            MediaRow(
                                title = shelf.label.ifBlank { "Топ сериалы Netflix" },
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
                    }

                    "trendingTv" -> {
                        if (state.trendingSeries.isNotEmpty()) {
                            MediaRow(
                                title = shelf.label.ifBlank { "Популярные сериалы" },
                                items = state.trendingSeries,
                                resolvePosterUrl = resolvePosterUrl,
                                onTitleClick = onTitleClick,
                                rowState = trendingSeriesState,
                                firstItemFocusRequester = trendingSeriesFocusRequester,
                                upFocusRequester = homeFocusRequester
                            )
                        }
                    }

                    "popularTv" -> {
                        if (state.popularSeries.isNotEmpty()) {
                            MediaRow(
                                title = shelf.label.ifBlank { "Новые сезоны" },
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
        }
    }
}

package com.lumiere.tv.ui.collections

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.BackgroundDark
import com.lumiere.tv.theme.LumiereGold
import com.lumiere.tv.ui.components.MediaRow
import com.lumiere.tv.ui.components.TvNavDestination
import com.lumiere.tv.ui.components.TvTopBar

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CollectionsScreen(
    onTitleClick: (Title) -> Unit,
    onNavigateDestination: (TvNavDestination) -> Unit,
    onProfileClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    viewModel: CollectionsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val collectionsFocusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(80)
        try { collectionsFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        TvTopBar(
            currentDestination = TvNavDestination.COLLECTIONS,
            firstItemFocusRequester = collectionsFocusRequester,
            onNavigate = onNavigateDestination,
            profileName = "Lumiere",
            profileAvatar = null,
            onProfileClick = onProfileClick,
            onNotificationsClick = onNotificationsClick
        )

        if (uiState.isLoading && uiState.collections.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Загрузка подборок...",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiereGold
                )
            }
        } else {
            val resolvePoster = remember(viewModel) {
                { path: String? -> viewModel.resolvePosterUrl(path) }
            }

            val scrollState = rememberScrollState()
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(top = 16.dp, bottom = 48.dp),
                verticalArrangement = Arrangement.spacedBy(32.dp)
            ) {
                CURATED_COLLECTIONS.forEach { cat ->
                    val titles = uiState.collections[cat.id] ?: emptyList()
                    if (titles.isNotEmpty()) {
                        val isNetflix = cat.isNetflixMovies || cat.isNetflixTv
                        val subtitle = if (isNetflix) {
                            if (uiState.netflixPeriod == "week") {
                                if (cat.isNetflixTv) "Популярные оригинальные сериалы и хиты недели" else "Главные кинохиты и оригинальные премьеры этой недели"
                            } else {
                                if (cat.isNetflixTv) "Легендарные рекордсмены по просмотрам и рейтингу за всё время" else "Культовые шедевры мирового кино с признанием зрителей"
                            }
                        } else {
                            cat.subtitle
                        }

                        MediaRow(
                            title = cat.name,
                            subtitle = subtitle,
                            items = titles,
                            resolvePosterUrl = resolvePoster,
                            onTitleClick = onTitleClick,
                            badgeText = if (isNetflix) "NETFLIX" else null,
                            headerAction = if (isNetflix) {
                                {
                                    com.lumiere.tv.ui.components.NetflixPeriodSwitcher(
                                        selectedPeriod = uiState.netflixPeriod,
                                        onSelectPeriod = { viewModel.setNetflixPeriod(it) }
                                    )
                                }
                            } else null
                        )
                    }
                }
            }
        }
    }
}

package com.lumiere.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lumiere.core.storage.AppPreferences
import com.lumiere.tv.navigation.Screen
import com.lumiere.tv.theme.BackgroundDark
import com.lumiere.tv.theme.LumiereTvTheme
import com.lumiere.tv.ui.connect.ConnectScreen
import com.lumiere.tv.ui.home.HomeScreen
import com.lumiere.tv.ui.profiles.ProfilesScreen

class MainActivity : ComponentActivity() {

    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
        return try {
            val isDpad = event.keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN ||
                         event.keyCode == android.view.KeyEvent.KEYCODE_DPAD_UP ||
                         event.keyCode == android.view.KeyEvent.KEYCODE_DPAD_LEFT ||
                         event.keyCode == android.view.KeyEvent.KEYCODE_DPAD_RIGHT ||
                         event.keyCode == android.view.KeyEvent.KEYCODE_DPAD_CENTER ||
                         event.keyCode == android.view.KeyEvent.KEYCODE_ENTER

            // Automatic focus recovery: if the window has lost focus (e.g. after back navigation or screen transition),
            // restore default focus before dispatching
            if (currentFocus == null && event.action == android.view.KeyEvent.ACTION_DOWN && isDpad) {
                window.decorView.restoreDefaultFocus()
            }

            val handled = super.dispatchKeyEvent(event)
            if (!handled && isDpad) {
                // If focus was lost, recover focus to prevent swallowing remote inputs
                if (currentFocus == null && event.action == android.view.KeyEvent.ACTION_DOWN) {
                    window.decorView.requestFocus()
                }
                true
            } else {
                handled
            }
        } catch (e: Throwable) {
            android.util.Log.e("LumiereTV", "D-pad focus navigation exception trapped: ${e.message}", e)
            true
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val preferences = AppPreferences(applicationContext)

        setContent {
            LumiereTvTheme {
                val navController = rememberNavController()
                val serverUrl by preferences.serverUrl.collectAsState(initial = null)
                val activeProfileId by preferences.activeProfileId.collectAsState(initial = null)

                var lastBackPressTime by remember { mutableLongStateOf(0L) }
                val context = androidx.compose.ui.platform.LocalContext.current

                androidx.activity.compose.BackHandler {
                    val currentRoute = navController.currentBackStackEntry?.destination?.route
                    if (currentRoute == Screen.Home.route || currentRoute == Screen.Connect.route || currentRoute == null) {
                        val now = System.currentTimeMillis()
                        if (now - lastBackPressTime < 2500L) {
                            finish()
                        } else {
                            lastBackPressTime = now
                            android.widget.Toast.makeText(context, "Нажмите «Назад» еще раз для выхода", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        navController.popBackStack()
                    }
                }

                val startDestination = remember(serverUrl, activeProfileId) {
                    when {
                        serverUrl.isNullOrBlank() -> Screen.Connect.route
                        activeProfileId == null || activeProfileId == 0L -> Screen.Profiles.route
                        else -> Screen.Home.route
                    }
                }

                val navigateTab: (String) -> Unit = { targetRoute ->
                    if (navController.currentBackStackEntry?.destination?.route != targetRoute) {
                        navController.navigate(targetRoute) {
                            popUpTo(Screen.Home.route) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(BackgroundDark)
                ) {
                    NavHost(
                        navController = navController,
                        startDestination = startDestination
                    ) {
                        composable(Screen.Connect.route) {
                            ConnectScreen(
                                onConnected = {
                                    navController.navigate(Screen.Profiles.route) {
                                        popUpTo(Screen.Connect.route) { inclusive = true }
                                    }
                                }
                            )
                        }
                        composable(Screen.Profiles.route) {
                            ProfilesScreen(
                                onProfileChosen = {
                                    navController.navigate(Screen.Home.route) {
                                        popUpTo(Screen.Profiles.route) { inclusive = true }
                                    }
                                },
                                onChangeServer = {
                                    navController.navigate(Screen.Connect.route) {
                                        popUpTo(0)
                                    }
                                }
                            )
                        }
                        composable(Screen.Home.route) {
                            HomeScreen(
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "movie"))
                                },
                                onSearchClick = { navigateTab(Screen.Search.route) },
                                onIptvClick = { navigateTab(Screen.Iptv.route) },
                                onMoviesClick = { navigateTab(Screen.Movies.route) },
                                onSeriesClick = { navigateTab(Screen.Shows.route) },
                                onCollectionsClick = { navigateTab(Screen.Collections.route) },
                                onMyClick = { navigateTab(Screen.My.route) },
                                onDownloadsClick = { navigateTab(Screen.Downloads.route) },
                                onSettingsClick = { navigateTab(Screen.Settings.route) },
                                onProfileClick = { navigateTab(Screen.Profile.route) },
                                onNotificationsClick = { navigateTab(Screen.Notifications.route) }
                            )
                        }
                        composable(Screen.Movies.route) {
                            val app = (androidx.compose.ui.platform.LocalContext.current.applicationContext as android.app.Application)
                            val catalogVm = remember { com.lumiere.tv.ui.catalog.CatalogViewModel(app, "movie") }
                            com.lumiere.tv.ui.catalog.CatalogScreen(
                                mediaType = "movie",
                                titleName = "фильмы",
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "movie"))
                                },
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navigateTab(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> {}
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> navigateTab(Screen.Shows.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> navigateTab(Screen.Collections.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> navigateTab(Screen.Iptv.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> navigateTab(Screen.My.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> navigateTab(Screen.Downloads.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navigateTab(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> navigateTab(Screen.Settings.route)
                                    }
                                },
                                onProfileClick = { navigateTab(Screen.Profile.route) },
                                onNotificationsClick = { navigateTab(Screen.Notifications.route) },
                                viewModel = catalogVm
                            )
                        }
                        composable(Screen.Shows.route) {
                            val app = (androidx.compose.ui.platform.LocalContext.current.applicationContext as android.app.Application)
                            val catalogVm = remember { com.lumiere.tv.ui.catalog.CatalogViewModel(app, "tv") }
                            com.lumiere.tv.ui.catalog.CatalogScreen(
                                mediaType = "tv",
                                titleName = "сериалы",
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "tv"))
                                },
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navigateTab(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> navigateTab(Screen.Movies.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> {}
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> navigateTab(Screen.Collections.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> navigateTab(Screen.Iptv.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> navigateTab(Screen.My.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> navigateTab(Screen.Downloads.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navigateTab(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> navigateTab(Screen.Settings.route)
                                    }
                                },
                                onProfileClick = { navigateTab(Screen.Profile.route) },
                                onNotificationsClick = { navigateTab(Screen.Notifications.route) },
                                viewModel = catalogVm
                            )
                        }
                        composable(Screen.Collections.route) {
                            com.lumiere.tv.ui.collections.CollectionsScreen(
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "movie"))
                                },
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navigateTab(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> navigateTab(Screen.Movies.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> navigateTab(Screen.Shows.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> {}
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> navigateTab(Screen.Iptv.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> navigateTab(Screen.My.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> navigateTab(Screen.Downloads.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navigateTab(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> navigateTab(Screen.Settings.route)
                                    }
                                },
                                onProfileClick = { navigateTab(Screen.Profile.route) },
                                onNotificationsClick = { navigateTab(Screen.Notifications.route) }
                            )
                        }
                        composable(Screen.My.route) {
                            com.lumiere.tv.ui.my.MyScreen(
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "movie"))
                                },
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navigateTab(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> navigateTab(Screen.Movies.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> navigateTab(Screen.Shows.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> navigateTab(Screen.Collections.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> navigateTab(Screen.Iptv.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> {}
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> navigateTab(Screen.Downloads.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navigateTab(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> navigateTab(Screen.Settings.route)
                                    }
                                },
                                onProfileClick = { navigateTab(Screen.Profile.route) },
                                onNotificationsClick = { navigateTab(Screen.Notifications.route) }
                            )
                        }
                        composable(Screen.Downloads.route) {
                            com.lumiere.tv.ui.downloads.DownloadsScreen(
                                onPlayRequested = { streamUrl, title, subtitle, isHls ->
                                    navController.navigate(
                                        Screen.Player.createRoute(
                                            streamUrl = streamUrl,
                                            title = title,
                                            subtitle = subtitle,
                                            isHls = isHls
                                        )
                                    )
                                },
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navigateTab(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> navigateTab(Screen.Movies.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> navigateTab(Screen.Shows.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> navigateTab(Screen.Collections.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> navigateTab(Screen.Iptv.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> navigateTab(Screen.My.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> {}
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navigateTab(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> navigateTab(Screen.Settings.route)
                                    }
                                },
                                onProfileClick = { navigateTab(Screen.Profile.route) },
                                onNotificationsClick = { navigateTab(Screen.Notifications.route) }
                            )
                        }
                        composable(Screen.Settings.route) {
                            com.lumiere.tv.ui.settings.SettingsScreen(
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navigateTab(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> navigateTab(Screen.Movies.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> navigateTab(Screen.Shows.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> navigateTab(Screen.Collections.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> navigateTab(Screen.Iptv.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> navigateTab(Screen.My.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> navigateTab(Screen.Downloads.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navigateTab(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> {}
                                    }
                                },
                                onChangeServerClick = {
                                    navController.navigate(Screen.Connect.route) { popUpTo(0) }
                                },
                                onSwitchProfileClick = {
                                    navController.navigate(Screen.Profiles.route)
                                },
                                onNotificationsClick = {
                                    navController.navigate(Screen.Notifications.route)
                                }
                            )
                        }
                        composable(Screen.Search.route) {
                            com.lumiere.tv.ui.search.SearchScreen(
                                onBackClick = { navController.popBackStack() },
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "movie"))
                                }
                            )
                        }
                        composable(Screen.Iptv.route) {
                            com.lumiere.tv.ui.iptv.IptvScreen(
                                onBackClick = { navController.popBackStack() },
                                onNavigateDestination = { dest ->
                                    when (dest) {
                                        com.lumiere.tv.ui.components.TvNavDestination.HOME -> navController.navigate(Screen.Home.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.MOVIES -> navController.navigate(Screen.Movies.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SERIES -> navController.navigate(Screen.Shows.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.COLLECTIONS -> navController.navigate(Screen.Collections.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.IPTV -> {}
                                        com.lumiere.tv.ui.components.TvNavDestination.MY -> navController.navigate(Screen.My.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.DOWNLOADS -> navController.navigate(Screen.Downloads.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SEARCH -> navController.navigate(Screen.Search.route)
                                        com.lumiere.tv.ui.components.TvNavDestination.SETTINGS -> navController.navigate(Screen.Settings.route)
                                    }
                                },
                                onProfileClick = { navController.navigate(Screen.Profile.route) },
                                onNotificationsClick = { navController.navigate(Screen.Notifications.route) }
                            )
                        }
                        composable(Screen.Notifications.route) {
                            com.lumiere.tv.ui.notifications.NotificationsScreen(
                                onBackClick = { navController.popBackStack() },
                                onTitleClick = { mediaId, mediaType ->
                                    navController.navigate(Screen.Details.createRoute(mediaId, mediaType))
                                }
                            )
                        }
                        composable(Screen.Profile.route) {
                            com.lumiere.tv.ui.profile.ProfileScreen(
                                onBackClick = { navController.popBackStack() },
                                onTitleClick = { title ->
                                    navController.navigate(Screen.Details.createRoute(title.id, title.type ?: "movie"))
                                },
                                onSwitchProfileClick = {
                                    navController.navigate(Screen.Profiles.route)
                                },
                                onLogoutClick = {
                                    navController.navigate(Screen.Connect.route) {
                                        popUpTo(0)
                                    }
                                }
                            )
                        }
                        composable(
                            route = Screen.Details.route,
                            arguments = listOf(
                                navArgument("id") { type = NavType.LongType },
                                navArgument("type") { type = NavType.StringType; defaultValue = "movie" }
                            )
                        ) { backStackEntry ->
                            val id = backStackEntry.arguments?.getLong("id") ?: 0L
                            val type = backStackEntry.arguments?.getString("type") ?: "movie"
                            val app = (androidx.compose.ui.platform.LocalContext.current.applicationContext as android.app.Application)
                            val detailsViewModel = remember(id, type) {
                                com.lumiere.tv.ui.details.DetailsViewModel(app, id, type)
                            }

                            com.lumiere.tv.ui.details.DetailsScreen(
                                mediaId = id,
                                mediaType = type,
                                onBackClick = { navController.popBackStack() },
                                onPlayRequested = { streamUrl, title, subtitle, isHls ->
                                    navController.navigate(
                                        Screen.Player.createRoute(
                                            streamUrl = streamUrl,
                                            title = title,
                                            subtitle = subtitle,
                                            isHls = isHls,
                                            mediaId = id,
                                            mediaType = type
                                        )
                                    )
                                },
                                onSimilarTitleClick = { sim ->
                                    navController.navigate(Screen.Details.createRoute(sim.id, sim.type ?: "movie"))
                                },
                                viewModel = detailsViewModel
                            )
                        }
                        composable(
                            route = Screen.Player.route,
                            arguments = listOf(
                                navArgument("url") { type = NavType.StringType; defaultValue = "" },
                                navArgument("title") { type = NavType.StringType; defaultValue = "" },
                                navArgument("subtitle") { type = NavType.StringType; defaultValue = "" },
                                navArgument("hls") { type = NavType.BoolType; defaultValue = false },
                                navArgument("mediaId") { type = NavType.LongType; defaultValue = 0L },
                                navArgument("mediaType") { type = NavType.StringType; defaultValue = "movie" },
                                navArgument("season") { type = NavType.IntType; defaultValue = 0 },
                                navArgument("episode") { type = NavType.IntType; defaultValue = 0 }
                            )
                        ) { backStackEntry ->
                            val url = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("url").orEmpty(), java.nio.charset.StandardCharsets.UTF_8.toString())
                            val title = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("title").orEmpty(), java.nio.charset.StandardCharsets.UTF_8.toString())
                            val subtitle = java.net.URLDecoder.decode(backStackEntry.arguments?.getString("subtitle").orEmpty(), java.nio.charset.StandardCharsets.UTF_8.toString())
                            val isHls = backStackEntry.arguments?.getBoolean("hls") ?: false
                            val mediaId = backStackEntry.arguments?.getLong("mediaId") ?: 0L
                            val mediaType = backStackEntry.arguments?.getString("mediaType") ?: "movie"

                            com.lumiere.tv.ui.player.PlayerScreen(
                                streamUrl = url,
                                title = title,
                                subtitle = subtitle,
                                isHls = isHls,
                                mediaId = mediaId,
                                mediaType = mediaType,
                                onBackClick = { navController.popBackStack() }
                            )
                        }
                    }
                }
            }
        }
    }
}

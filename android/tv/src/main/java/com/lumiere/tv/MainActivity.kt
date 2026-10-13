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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val preferences = AppPreferences(applicationContext)

        setContent {
            LumiereTvTheme {
                val navController = rememberNavController()
                val serverUrl by preferences.serverUrl.collectAsState(initial = null)
                val activeProfileId by preferences.activeProfileId.collectAsState(initial = null)

                val startDestination = remember(serverUrl, activeProfileId) {
                    when {
                        serverUrl.isNullOrBlank() -> Screen.Connect.route
                        activeProfileId == null || activeProfileId == 0L -> Screen.Profiles.route
                        else -> Screen.Home.route
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
                                onSearchClick = {
                                    navController.navigate(Screen.Search.route)
                                },
                                onIptvClick = {
                                    navController.navigate(Screen.Iptv.route)
                                },
                                onProfileClick = {
                                    navController.navigate(Screen.Profiles.route)
                                }
                            )
                        }
                        composable(Screen.Search.route) {
                            // Implemented in Task 9
                        }
                        composable(Screen.Iptv.route) {
                            // Implemented in Task 8
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
                        ) {
                            // Implemented in Task 7
                        }
                    }
                }
            }
        }
    }
}

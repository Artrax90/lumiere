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
                            // Implemented in Task 4
                        }
                        composable(Screen.Profiles.route) {
                            // Implemented in Task 4
                        }
                        composable(Screen.Home.route) {
                            // Implemented in Task 5
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
                        ) {
                            // Implemented in Task 6
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

package com.dumbmirror.remote.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.dumbmirror.remote.ui.screens.ConfigurationScreen
import com.dumbmirror.remote.ui.screens.MediaScreen
import com.dumbmirror.remote.ui.screens.SensorsScreen

@Composable
fun AppNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = Destinations.Config.route,
        modifier = modifier
    ) {
        composable(Destinations.Config.route) {
            ConfigurationScreen()
        }
        composable(Destinations.Media.route) {
            MediaScreen()
        }
        composable(Destinations.Sensors.route) {
            SensorsScreen()
        }
    }
}

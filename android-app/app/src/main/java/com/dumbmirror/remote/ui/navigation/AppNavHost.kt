package com.dumbmirror.remote.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.dumbmirror.remote.ui.screens.DashboardScreen
import com.dumbmirror.remote.ui.screens.MediaScreen
import com.dumbmirror.remote.ui.screens.SensorsScreen
import com.dumbmirror.remote.ui.screens.SystemsScreen

@Composable
fun AppNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = Destinations.Dashboard.route,
        modifier = modifier
    ) {
        composable(Destinations.Dashboard.route) {
            DashboardScreen()
        }
        composable(Destinations.Media.route) {
            MediaScreen()
        }
        composable(Destinations.Sensors.route) {
            SensorsScreen()
        }
        composable(Destinations.Systems.route) {
            SystemsScreen()
        }
    }
}

package com.dumbmirror.remote.ui.navigation

data class AppDestination(
    val route: String,
    val title: String
)

object Destinations {
    val Dashboard = AppDestination("dashboard", "Dashboard")
    val Media = AppDestination("media", "Mídia")
    val Sensors = AppDestination("sensors", "Sensores")
    val Systems = AppDestination("systems", "Sistemas")

    val all = listOf(Dashboard, Media, Sensors, Systems)
}

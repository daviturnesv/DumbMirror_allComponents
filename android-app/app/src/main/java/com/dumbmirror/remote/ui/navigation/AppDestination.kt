package com.dumbmirror.remote.ui.navigation

data class AppDestination(
    val route: String,
    val title: String
)

object Destinations {
    val Config = AppDestination("config", "Configuração")
    val Media = AppDestination("media", "Controles")
    val Sensors = AppDestination("sensors", "Sensores")

    val all = listOf(Config, Media, Sensors)
}

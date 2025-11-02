package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaScreen(
    modifier: Modifier = Modifier,
    viewModel: RemoteCommandViewModel = viewModel(factory = RemoteCommandViewModel.Factory)
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.statusMessage, uiState.errorMessage) {
        val feedback = uiState.errorMessage ?: uiState.statusMessage
        if (!feedback.isNullOrBlank()) {
            snackbarHostState.showSnackbar(feedback)
            viewModel.clearFeedback()
        }
    }

    val pageCommands = remember {
        listOf(
            RemoteCommand(
                label = "Página Home",
                notification = "PAGE_SELECT",
                payload = mapOf("name" to "Home"),
                successMessage = "Solicitada a página Home.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Página Mídia",
                notification = "PAGE_SELECT",
                payload = mapOf("name" to "Mídia"),
                successMessage = "Solicitada a página Mídia.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Página Vídeo",
                notification = "PAGE_SELECT",
                payload = mapOf("name" to "Vídeo"),
                successMessage = "Solicitada a página Vídeo.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Próxima página",
                notification = "PAGE_NEXT",
                successMessage = "Página seguinte solicitada."
            ),
            RemoteCommand(
                label = "Página anterior",
                notification = "PAGE_PREVIOUS",
                successMessage = "Página anterior solicitada."
            )
        )
    }

    val mediaModuleCommands = remember {
        listOf(
            RemoteCommand(
                label = "Mostrar Spotify",
                notification = "SHOW",
                payload = mapOf("module" to listOf("MMM-OnSpotify")),
                successMessage = "Solicitada a exibição do módulo Spotify.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar Spotify",
                notification = "HIDE",
                payload = mapOf("module" to listOf("MMM-OnSpotify")),
                successMessage = "Solicitado ocultar o módulo Spotify.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar LiveLyrics",
                notification = "SHOW",
                payload = mapOf("module" to listOf("MMM-LiveLyrics")),
                successMessage = "Solicitada a exibição do LiveLyrics.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar LiveLyrics",
                notification = "HIDE",
                payload = mapOf("module" to listOf("MMM-LiveLyrics")),
                successMessage = "Solicitado ocultar o LiveLyrics.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar Screencast",
                notification = "SHOW",
                payload = mapOf("module" to listOf("MMM-Screencast")),
                successMessage = "Solicitada a exibição do Screencast.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar Screencast",
                notification = "HIDE",
                payload = mapOf("module" to listOf("MMM-Screencast")),
                successMessage = "Solicitado ocultar o Screencast.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Alternar mídia",
                notification = "TOGGLE",
                payload = mapOf("module" to listOf("MMM-OnSpotify", "MMM-LiveLyrics")),
                successMessage = "Solicitada alternância dos módulos de mídia."
            )
        )
    }

    val isEnabled = uiState.isConfigured && !uiState.isSending

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Text(text = "Mídia", style = MaterialTheme.typography.headlineMedium)
            Text(text = uiState.connectionSummary, style = MaterialTheme.typography.bodyMedium)
            if (!uiState.isConfigured) {
                Text(
                    text = "Configure a conexão na aba Dashboard para habilitar os comandos remotos.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (uiState.isSending) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            RemoteCommandSection(
                title = "Navegação de páginas",
                commands = pageCommands,
                enabled = isEnabled,
                onCommandClick = { command ->
                    viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Selecione ou navegue entre as páginas configuradas no espelho."
            )

            RemoteCommandSection(
                title = "Módulos de mídia",
                commands = mediaModuleCommands,
                enabled = isEnabled,
                onCommandClick = { command ->
                    viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Mostre ou oculte rapidamente os módulos de mídia (Spotify, letras e screencast)."
            )
        }
    }
}

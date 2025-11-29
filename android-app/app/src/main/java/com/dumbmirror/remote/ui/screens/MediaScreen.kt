package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "SHOW",
                    "module" to listOf("MMM-OnSpotify")
                ),
                successMessage = "Solicitada a exibição do módulo Spotify.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar Spotify",
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "HIDE",
                    "module" to listOf("MMM-OnSpotify")
                ),
                successMessage = "Solicitado ocultar o módulo Spotify.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar LiveLyrics",
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "SHOW",
                    "module" to listOf("MMM-LiveLyrics")
                ),
                successMessage = "Solicitada a exibição do LiveLyrics.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar LiveLyrics",
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "HIDE",
                    "module" to listOf("MMM-LiveLyrics")
                ),
                successMessage = "Solicitado ocultar o LiveLyrics.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar Screencast",
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "SHOW",
                    "module" to listOf("MMM-Screencast")
                ),
                successMessage = "Solicitada a exibição do Screencast.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar Screencast",
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "HIDE",
                    "module" to listOf("MMM-Screencast")
                ),
                successMessage = "Solicitado ocultar o Screencast.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Alternar mídia",
                notification = "REMOTE_ACTION",
                payload = mapOf(
                    "action" to "TOGGLE",
                    "module" to listOf("MMM-OnSpotify", "MMM-LiveLyrics")
                ),
                successMessage = "Solicitada alternância dos módulos de mídia."
            ),
            RemoteCommand(
                label = "Ocultar debug",
                notification = "MMM-Screencast:DEBUG_COLLAPSE",
                successMessage = "Painel de debug recolhido.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar debug",
                notification = "MMM-Screencast:DEBUG_EXPAND",
                successMessage = "Painel de debug exibido novamente.",
                style = RemoteCommandStyle.OUTLINED
            )
        )
    }

    val homeModuleCommands = remember {
        listOf(
            RemoteCommand(
                label = "Expandir calendário",
                notification = "CALENDAR_SET_VIEW",
                payload = mapOf(
                    "limitDays" to 0,
                    "maximumEntries" to 30
                ),
                successMessage = "Calendário expandido para mostrar feriados.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Restaurar calendário",
                notification = "CALENDAR_RESET_VIEW",
                successMessage = "Calendário voltou ao modo compacto.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar detalhes do clima",
                notification = "WEATHER_TOGGLE_UV_AQI",
                payload = mapOf("show" to true),
                successMessage = "Detalhes extras do clima exibidos.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar detalhes do clima",
                notification = "WEATHER_TOGGLE_UV_AQI",
                payload = mapOf("show" to false),
                successMessage = "Detalhes extras do clima ocultos.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar previsão diária",
                notification = "WEATHER_SET_VISIBILITY",
                payload = mapOf("target" to "forecast", "visible" to true),
                successMessage = "Previsão diária exibida.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar previsão diária",
                notification = "WEATHER_SET_VISIBILITY",
                payload = mapOf("target" to "forecast", "visible" to false),
                successMessage = "Previsão diária ocultada.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Mostrar previsão horária",
                notification = "WEATHER_SET_VISIBILITY",
                payload = mapOf("target" to "hourly", "visible" to true),
                successMessage = "Previsão horária exibida.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Ocultar previsão horária",
                notification = "WEATHER_SET_VISIBILITY",
                payload = mapOf("target" to "hourly", "visible" to false),
                successMessage = "Previsão horária ocultada.",
                style = RemoteCommandStyle.OUTLINED
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
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Text(text = "Controles", style = MaterialTheme.typography.headlineMedium)
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

            CommandCard(
                title = "Navegação de páginas",
                description = "Selecione ou navegue entre as páginas configuradas no espelho.",
                content = {
                    CommandGrid(
                        commands = pageCommands,
                        enabled = isEnabled,
                        onCommandClick = { command ->
                            viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                        }
                    )
                }
            )

            CommandCard(
                title = "Página principal",
                description = "Gerencie o calendário e os blocos de clima exibidos na Home.",
                content = {
                    CommandGrid(
                        commands = homeModuleCommands,
                        enabled = isEnabled,
                        onCommandClick = { command ->
                            viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                        }
                    )
                }
            )

            CommandCard(
                title = "Módulos de mídia",
                description = "Mostre ou oculte rapidamente os módulos de mídia (Spotify, letras e screencast).",
                content = {
                    CommandGrid(
                        commands = mediaModuleCommands,
                        enabled = isEnabled,
                        onCommandClick = { command ->
                            viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                        }
                    )
                }
            )
        }
    }
}

@Composable
private fun CommandCard(
    title: String,
    description: String,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.large
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(text = description, style = MaterialTheme.typography.bodyMedium)
            }
            content()
        }
    }
}

@Composable
private fun CommandGrid(
    commands: List<RemoteCommand>,
    enabled: Boolean,
    onCommandClick: (RemoteCommand) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        commands.chunked(2).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                rowItems.forEach { command ->
                    RemoteCommandButton(
                        command = command,
                        enabled = enabled,
                        onClick = { onCommandClick(command) },
                        modifier = Modifier
                            .weight(1f)
                            .wrapContentHeight()
                    )
                }
                if (rowItems.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun RemoteCommandButton(
    command: RemoteCommand,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val content: @Composable () -> Unit = {
        Text(text = command.label, textAlign = TextAlign.Center)
    }
    when (command.style) {
        RemoteCommandStyle.FILLED -> {
            Button(onClick = onClick, enabled = enabled, modifier = modifier) {
                content()
            }
        }
        RemoteCommandStyle.OUTLINED -> {
            OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier) {
                content()
            }
        }
    }
}

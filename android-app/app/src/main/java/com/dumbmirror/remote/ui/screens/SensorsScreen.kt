package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun SensorsScreen(
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

    val quickCommands = remember {
        listOf(
            RemoteCommand(
                label = "Exportar CSV",
                notification = "SENSORDATA_EXPORT",
                successMessage = "Exportação de sensores iniciada.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Atualizar histórico",
                notification = "SENSORDATA_REFRESH_HISTORY",
                successMessage = "Atualização do histórico solicitada.",
                style = RemoteCommandStyle.OUTLINED
            )
        )
    }

    val reportCommands = remember {
        listOf(
            RemoteCommand(
                label = "Relatório rápido",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "report"),
                successMessage = "Relatório rápido solicitado."
            ),
            RemoteCommand(
                label = "Relatório 2h",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "report2h"),
                successMessage = "Relatório das últimas 2 horas solicitado."
            ),
            RemoteCommand(
                label = "Relatório do dia",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "reportDay"),
                successMessage = "Relatório diário solicitado."
            ),
            RemoteCommand(
                label = "Relatório do mês",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "reportMonth"),
                successMessage = "Relatório mensal solicitado."
            ),
            RemoteCommand(
                label = "Ocultar relatório",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "hideReport"),
                successMessage = "Painel de relatório será ocultado.",
                style = RemoteCommandStyle.OUTLINED
            )
        )
    }

    val visualizationCommands = remember {
        listOf(
            RemoteCommand(
                label = "Mostrar gráficos",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "showCharts"),
                successMessage = "Gráficos solicitados."
            ),
            RemoteCommand(
                label = "Ocultar gráficos",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "hideCharts"),
                successMessage = "Ocultação dos gráficos solicitada.",
                style = RemoteCommandStyle.OUTLINED
            ),
            RemoteCommand(
                label = "Aumentar relatório",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "reportScaleUp"),
                successMessage = "Escala do relatório aumentada."
            ),
            RemoteCommand(
                label = "Reduzir relatório",
                notification = "SENSORDATA_COMMAND",
                payload = mapOf("action" to "reportScaleDown"),
                successMessage = "Escala do relatório reduzida."
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
            Text(text = "Sensores", style = MaterialTheme.typography.headlineMedium)
            Text(text = uiState.connectionSummary, style = MaterialTheme.typography.bodyMedium)
            if (!uiState.isConfigured) {
                Text(
                    text = "Configure a conexão na aba Dashboard para controlar os sensores remotamente.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (uiState.isSending) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            RemoteCommandSection(
                title = "Ações rápidas",
                commands = quickCommands,
                enabled = isEnabled,
                onCommandClick = { command ->
                    viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Dispare exportações ou atualizações imediatas do histórico."
            )

            RemoteCommandSection(
                title = "Relatórios",
                commands = reportCommands,
                enabled = isEnabled,
                onCommandClick = { command ->
                    viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Solicite relatórios agregados com diferentes intervalos."
            )

            RemoteCommandSection(
                title = "Visualização",
                commands = visualizationCommands,
                enabled = isEnabled,
                onCommandClick = { command ->
                    viewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Ajuste a exibição de gráficos e a escala do painel de relatório."
            )
        }
    }
}

package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.SensorReading
import com.dumbmirror.remote.ui.screens.RemoteCommand
import com.dumbmirror.remote.ui.screens.RemoteCommandSection
import com.dumbmirror.remote.ui.screens.RemoteCommandStyle
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlin.math.abs
import kotlin.math.roundToInt
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun SensorsScreen(
    modifier: Modifier = Modifier,
    commandViewModel: RemoteCommandViewModel = viewModel(factory = RemoteCommandViewModel.Factory),
    sensorsViewModel: SensorsViewModel = viewModel(factory = SensorsViewModel.Factory)
) {
    val commandState by commandViewModel.uiState.collectAsState()
    val sensorsState by sensorsViewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scrollState = rememberScrollState()

    LaunchedEffect(commandState.commandSequence) {
        val lastNotification = commandState.lastNotification
        val statusMessage = commandState.statusMessage
        val errorMessage = commandState.errorMessage
        val summaryNotifications = setOf("DAILYBRIEFING_REFRESH", "DAILYBRIEFING_CLEAR")

        if (!statusMessage.isNullOrBlank() && lastNotification in summaryNotifications) {
            delay(1500)
            sensorsViewModel.refreshSensors()
        }

        val feedback = errorMessage ?: statusMessage
        if (!feedback.isNullOrBlank()) {
            snackbarHostState.showSnackbar(feedback)
            commandViewModel.clearFeedback()
        }
    }

    LaunchedEffect(sensorsState.errorMessage) {
        val feedback = sensorsState.errorMessage
        if (!feedback.isNullOrBlank()) {
            snackbarHostState.showSnackbar(feedback)
            sensorsViewModel.clearError()
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

    val briefingCommands = remember {
        listOf(
            RemoteCommand(
                label = "Gerar resumo",
                notification = "DAILYBRIEFING_REFRESH",
                successMessage = "Resumo diário solicitado."
            ),
            RemoteCommand(
                label = "Ocultar resumo",
                notification = "DAILYBRIEFING_CLEAR",
                successMessage = "Resumo diário será ocultado.",
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
            )
        )
    }

    val isEnabled = commandState.isConfigured && !commandState.isSending

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Text(text = "Sensores", style = MaterialTheme.typography.headlineMedium)
            ConnectionStatusCard(
                config = sensorsState.config,
                summary = sensorsState.connectionSummary,
                lastSync = sensorsState.lastUpdatedAt,
                isReady = sensorsState.isConfigured && sensorsState.supportsDataFetch
            )
            if (!commandState.isConfigured) {
                Text(
                    text = "Configure a conexão na aba Dashboard para controlar os sensores remotamente.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (commandState.isSending) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            if (sensorsState.isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            SensorOverviewSection(
                state = sensorsState,
                onRefresh = sensorsViewModel::refreshSensors
            )

            RemoteCommandSection(
                title = "Ações rápidas",
                commands = quickCommands,
                enabled = isEnabled,
                onCommandClick = { command: RemoteCommand ->
                    commandViewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Dispare exportações ou atualizações imediatas do histórico."
            )

            RemoteCommandSection(
                title = "Resumo diário",
                commands = briefingCommands,
                enabled = isEnabled,
                onCommandClick = { command: RemoteCommand ->
                    commandViewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Gere ou oculte o resumo diário apresentado pelo espelho."
            )

            RemoteCommandSection(
                title = "Relatórios",
                commands = reportCommands,
                enabled = isEnabled,
                onCommandClick = { command: RemoteCommand ->
                    commandViewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Solicite relatórios agregados com diferentes intervalos."
            )

            RemoteCommandSection(
                title = "Visualização",
                commands = visualizationCommands,
                enabled = isEnabled,
                onCommandClick = { command: RemoteCommand ->
                    commandViewModel.sendCommand(command.notification, command.payload, command.successMessage)
                },
                description = "Controle rapidamente a exibição dos gráficos no espelho."
            )
        }
    }
}

@Composable
private fun SensorOverviewSection(
    state: SensorsUiState,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Painel de sensores",
                style = MaterialTheme.typography.titleMedium
            )
            if (state.supportsDataFetch && state.isConfigured) {
                OutlinedButton(onClick = onRefresh, enabled = !state.isLoading) {
                    Text(text = "Atualizar sensores")
                }
            }
        }

        if (!state.supportsDataFetch) {
            Text(
                text = "A leitura de sensores está disponível apenas quando a conexão via Relay está configurada.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.tertiary
            )
        } else {
            SensorLatestCard(reading = state.latest)

            SensorJsonCard(
                title = "Resumo",
                jsonText = state.summaryText,
                forwardedAt = state.summaryForwardedAt,
                receivedAt = state.summaryReceivedAt,
                element = state.summaryRaw
            )

            SensorReportCard(
                jsonText = state.reportText,
                forwardedAt = state.reportForwardedAt,
                receivedAt = state.reportReceivedAt,
                element = state.reportRaw
            )
        }
    }
}

@Composable
private fun ConnectionStatusCard(
    config: ConnectionConfig,
    summary: String,
    lastSync: Long?,
    isReady: Boolean,
    modifier: Modifier = Modifier
) {
    val indicatorColor = if (isReady) {
        MaterialTheme.colorScheme.tertiary
    } else {
        MaterialTheme.colorScheme.error
    }
    val modeLabel = when (config.mode) {
        ConnectionMode.LAN -> "LAN"
        ConnectionMode.RELAY -> "Relay"
    }
    val endpoint = when (config.mode) {
        ConnectionMode.LAN -> config.baseUrl.takeIf { it.isNotBlank() }
        ConnectionMode.RELAY -> config.relay.baseUrl.takeIf { it.isNotBlank() }
    }
    val mirrorLabel = config.relay.mirrorName ?: config.relay.mirrorId
    val statusDetail = summary.substringAfter("status:", missingDelimiterValue = "")
        .trim()
        .ifEmpty { null }
    val statusText = statusDetail?.replaceFirstChar { it.uppercase() }
        ?: if (config.isConfigured) {
            if (isReady) "Conexão ativa" else "Configuração incompleta"
        } else {
            "Conexão não configurada"
        }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(indicatorColor)
                )
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = "Status da conexão", style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
            StatusInfoRow(label = "Modo", value = modeLabel)
            endpoint?.let { url ->
                StatusInfoRow(
                    label = "Endpoint",
                    value = url,
                    monospace = true
                )
            }
            mirrorLabel?.let { label ->
                StatusInfoRow(label = "Espelho", value = label)
            }
            lastSync?.let { timestamp ->
                formatTimestamp(timestamp)?.let { formatted ->
                    StatusInfoRow(label = "Última sincronização", value = formatted)
                }
            }
        }
    }
}

@Composable
private fun StatusInfoRow(label: String, value: String, monospace: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = label.uppercase(Locale.getDefault()),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
        Text(
            text = value,
            style = if (monospace) {
                MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
            } else {
                MaterialTheme.typography.bodyMedium
            }
        )
    }
}

@Composable
private fun SensorLatestCard(reading: SensorReading?, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "Última leitura", style = MaterialTheme.typography.titleMedium)
            if (reading == null) {
                Text(
                    text = "Nenhuma leitura recebida até o momento.",
                    style = MaterialTheme.typography.bodySmall
                )
            } else {
                var showDetails by remember { mutableStateOf(false) }
                val sensorTimestamp = formatTimestamp(reading.timestampMs) ?: "—"
                Text(
                    text = "Coletada em $sensorTimestamp",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    SensorMetricTile(
                        label = "Temperatura",
                        value = formatTemp(reading.temperatureC),
                        modifier = Modifier.weight(1f)
                    )
                    SensorMetricTile(
                        label = "Umidade",
                        value = formatHumidity(reading.humidityPercent),
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    SensorMetricTile(
                        label = "Luminosidade",
                        value = formatLux(reading.lightLux),
                        modifier = Modifier.weight(1f)
                    )
                    SensorMetricTile(
                        label = "Movimento",
                        value = formatMotion(reading),
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(onClick = { showDetails = !showDetails }) {
                    Text(text = if (showDetails) "Ocultar detalhes da entrega" else "Ver detalhes da entrega")
                }
                if (showDetails) {
                    Spacer(modifier = Modifier.height(4.dp))
                    SensorValueRow(
                        label = "Recebido às",
                        value = formatTimestamp(reading.receivedAt) ?: "—"
                    )
                    SensorValueRow(
                        label = "Encaminhado às",
                        value = formatTimestamp(reading.forwardedAt) ?: "—"
                    )
                    reading.sender?.takeIf { it.isNotBlank() }?.let { sender ->
                        SensorValueRow(label = "Origem", value = sender)
                    }
                }
            }
        }
    }
}

@Composable
private fun SensorMetricTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label.uppercase(Locale.getDefault()),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun SensorJsonCard(
    title: String,
    jsonText: String?,
    forwardedAt: Long?,
    receivedAt: Long?,
    element: JsonElement?,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            val forwarded = formatTimestamp(forwardedAt)
            val received = formatTimestamp(receivedAt)
            if (!forwarded.isNullOrBlank() || !received.isNullOrBlank()) {
                val meta = buildList {
                    if (!forwarded.isNullOrBlank()) add("encaminhado: $forwarded")
                    if (!received.isNullOrBlank()) add("recebido: $received")
                }.joinToString(separator = " · ")
                Text(text = meta, style = MaterialTheme.typography.bodySmall)
            }
            SensorJsonContent(element = element, jsonText = jsonText, allowRawToggle = true)
        }
    }
}

@Composable
private fun SensorReportCard(
    jsonText: String?,
    forwardedAt: Long?,
    receivedAt: Long?,
    element: JsonElement?,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "Relatório", style = MaterialTheme.typography.titleMedium)
            val forwarded = formatTimestamp(forwardedAt)
            val received = formatTimestamp(receivedAt)
            if (!forwarded.isNullOrBlank() || !received.isNullOrBlank()) {
                val meta = buildList {
                    if (!forwarded.isNullOrBlank()) add("encaminhado: $forwarded")
                    if (!received.isNullOrBlank()) add("recebido: $received")
                }.joinToString(separator = " · ")
                Text(text = meta, style = MaterialTheme.typography.bodySmall)
            }
            SensorReportContent(element = element, jsonText = jsonText)
        }
    }
}

@Composable
private fun SensorJsonContent(element: JsonElement?, jsonText: String?, allowRawToggle: Boolean) {
    if (element == null) {
        Text(text = "Nenhum dado disponível.", style = MaterialTheme.typography.bodySmall)
        return
    }
    val narrative = element.extractDailyBriefingNarrative()
    val condensed = element.buildCondensedSnapshot()

    when {
        !narrative.isNullOrBlank() -> {
            Text(text = narrative.trim(), style = MaterialTheme.typography.bodyMedium)
            if (!condensed.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = condensed, style = MaterialTheme.typography.bodySmall)
            }
        }
        !condensed.isNullOrBlank() -> {
            Text(text = condensed, style = MaterialTheme.typography.bodySmall)
        }
        else -> {
            Text(text = "Nenhum resumo disponível.", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (!allowRawToggle || jsonText.isNullOrBlank()) {
        return
    }
    var showRaw by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { showRaw = !showRaw }) {
        Text(text = if (showRaw) "Ocultar JSON" else "Mostrar JSON")
    }
    if (showRaw) {
        Text(text = jsonText, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun SensorReportContent(element: JsonElement?, jsonText: String?) {
    if (element == null) {
        Text(text = "Nenhum relatório disponível.", style = MaterialTheme.typography.bodySmall)
        return
    }
    val narrative = element.extractReportNarrative() ?: element.buildHumanNarrative()
    val condensed = element.buildCondensedSnapshot()
    if (!narrative.isNullOrBlank()) {
        Text(text = narrative, style = MaterialTheme.typography.bodyMedium)
    }
    if (!condensed.isNullOrBlank()) {
        Text(text = condensed, style = MaterialTheme.typography.bodySmall)
    }
    if (jsonText.isNullOrBlank()) {
        return
    }
    var showRaw by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { showRaw = !showRaw }) {
        Text(text = if (showRaw) "Ocultar JSON" else "Ver detalhes brutos")
    }
    if (showRaw) {
        Text(text = jsonText, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun SensorValueRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

private fun formatMotion(reading: SensorReading): String {
    return when {
        reading.motionFlag == true -> "Detectado"
        reading.motionFlag == false -> "Ausente"
        !reading.motionRaw.isNullOrBlank() -> reading.motionRaw
        else -> "—"
    }
}

private val sensorLocale: Locale = Locale("pt", "BR")
private val sensorDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss").withLocale(sensorLocale)
private val sensorTimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withLocale(sensorLocale)
private val sensorDateLabelFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM").withLocale(sensorLocale)

private fun formatTimestamp(epochMillis: Long?): String? {
    if (epochMillis == null) {
        return null
    }
    return runCatching {
        val instant = Instant.ofEpochMilli(epochMillis)
        val localDateTime = instant.atZone(ZoneId.systemDefault()).toLocalDateTime()
        sensorDateFormatter.format(localDateTime)
    }.getOrNull()
}

private fun JsonElement?.extractReportNarrative(): String? {
    val obj = this as? JsonObject ?: return null
    obj["aiSummary"]?.let { return it.toDisplayString() }
    obj["aiSummaryFallback"]?.let { return it.toDisplayString() }
    obj["summary"]?.let { return it.toDisplayString() }
    val data = obj["data"] as? JsonObject
    data?.get("summary")?.let { return it.toDisplayString() }
    data?.get("summaryText")?.let { return it.toDisplayString() }
    data?.get("analysis")?.let { return it.toDisplayString() }
    data?.get("insights")?.let { return it.toDisplayString() }
    return null
}

private fun JsonElement.toDisplayString(): String {
    return when (this) {
        is JsonPrimitive -> this.content
        else -> this.toString()
    }
}

private fun JsonElement?.buildCondensedSnapshot(): String? {
    val obj = this as? JsonObject ?: return null
    val stats = obj["stats"] as? JsonObject ?: return null
    val parts = mutableListOf<String>()
    fun appendMetric(key: String, label: String, unit: String) {
        val metric = stats[key] as? JsonObject ?: return
        val avg = metric["avg"]?.asNumberString()
        val min = metric["min"]?.asNumberString()
        val max = metric["max"]?.asNumberString()
        if (avg != null && min != null && max != null) {
            parts.add("$label $avg$unit (mín $min, máx $max)")
        }
    }
    appendMetric("temperature", "Temp.", "°C")
    appendMetric("humidity", "Umidade", "%")
    appendMetric("light", "Luz", " lx")
    val motion = stats["motion"] as? JsonObject
    val motionRatio = motion?.get("ratio")?.asNumberString()?.toDoubleOrNull()
    val motionSamples = motion?.get("samples")?.asNumberString()
    if (motionRatio != null && motionSamples != null) {
        val percent = (motionRatio * 100).toInt()
        parts.add("Movimento ${percent}% de ${motionSamples} amostras")
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(separator = " · ")
}

private fun JsonElement?.extractDailyBriefingNarrative(): String? {
    val obj = this as? JsonObject ?: return null

    val directText = obj["text"]?.toDisplayString()?.takeIf { !it.isNullOrBlank() }
    if (!directText.isNullOrBlank()) {
        return directText
    }

    val data = obj["data"] as? JsonObject
    data?.get("text")?.toDisplayString()?.takeIf { !it.isNullOrBlank() }?.let { return it }

    val weather = obj["weatherSummary"]?.toDisplayString()
        ?: data?.get("weatherSummary")?.toDisplayString()
    val agenda = obj["agendaSummary"]?.toDisplayString()
        ?: data?.get("agendaSummary")?.toDisplayString()
    val error = obj["error"]?.toDisplayString()
        ?: data?.get("error")?.toDisplayString()

    val parts = buildList {
        if (!weather.isNullOrBlank()) add(weather)
        if (!agenda.isNullOrBlank()) add(agenda)
        if (!error.isNullOrBlank()) add("Erro: $error")
    }

    return parts.takeIf { it.isNotEmpty() }?.joinToString(separator = "\n")
}

private fun JsonElement.asNumberString(): String? {
    return when (this) {
        is JsonPrimitive -> when {
            this.isString -> this.content
            this.doubleOrNull != null -> String.format(Locale.getDefault(), "%.1f", this.doubleOrNull!!)
            else -> this.toString()
        }
        else -> null
    }
}

private fun JsonElement?.buildHumanNarrative(): String? {
    val obj = this as? JsonObject ?: return null
    val stats = obj["stats"] as? JsonObject ?: return null
    val groups = (obj["groups"] as? JsonArray)?.mapNotNull { it as? JsonObject }
    val timeRange = formatTimeWindow(obj["from"].asLongOrNull(), obj["to"].asLongOrNull())
    val rangeLabel = obj["rangeLabel"]?.toDisplayString()
    val anchor = when {
        timeRange != null -> "Entre $timeRange"
        !rangeLabel.isNullOrBlank() -> "Durante ${rangeLabel}"
        else -> "Durante o período monitorado"
    }

    val sentences = mutableListOf<String>()

    stats.metricAggregate("temperature")?.let { temp ->
        val amplitude = temp.amplitude()
        val descriptor = when {
            amplitude == null -> "comportamento estável"
            amplitude < 1.0 -> "com pouca variação"
            amplitude < 3.0 -> "com oscilações moderadas"
            else -> "com variação acentuada"
        }
        val minMax = if (temp.min != null && temp.max != null) {
            ", variando de ${formatTemp(temp.min)} a ${formatTemp(temp.max)}"
        } else {
            ""
        }
        sentences += "$anchor, a temperatura média ficou em ${formatTemp(temp.avg)}$minMax, $descriptor."
        groups?.computeTrend("temperature")?.let { trend ->
            if (trend.isRelevant(0.8)) {
                val direction = if (trend.delta > 0) "subiu" else "caiu"
                sentences += "Ao longo do período, a temperatura $direction de ${formatTemp(trend.start)} para ${formatTemp(trend.end)}."
            }
        }
    }

    stats.metricAggregate("humidity")?.let { humidity ->
        val amplitude = humidity.amplitude()
        val descriptor = when {
            amplitude == null -> "sem variações relevantes"
            amplitude < 5.0 -> "praticamente estável"
            amplitude < 12.0 -> "alternando entre níveis moderados"
            else -> "com picos bem marcados"
        }
        val minMax = if (humidity.min != null && humidity.max != null) {
            ", indo de ${formatHumidity(humidity.min)} a ${formatHumidity(humidity.max)}"
        } else {
            ""
        }
        sentences += "A umidade média ficou em ${formatHumidity(humidity.avg)}$minMax, $descriptor."
        if (amplitude != null && amplitude >= 12.0) {
            sentences += "O aumento repentino de umidade pode indicar vapor acumulado, como banho recente ou pouca ventilação."
        }
        groups?.computeTrend("humidity")?.let { trend ->
            if (trend.isRelevant(5.0)) {
                val direction = if (trend.delta > 0) "subiu" else "caiu"
                sentences += "A umidade $direction de ${formatHumidity(trend.start)} para ${formatHumidity(trend.end)}, sinalizando mudança nas condições do ambiente."
            }
        }
    }

    stats.metricAggregate("light")?.let { light ->
        light.avg?.let { avg ->
            val descriptor = when {
                avg < 20 -> "o ambiente permaneceu praticamente escuro"
                avg < 80 -> "a iluminação foi baixa na maior parte do tempo"
                avg < 200 -> "houve iluminação moderada"
                else -> "o espaço ficou bem iluminado"
            }
            val minMax = if (light.min != null && light.max != null) {
                ", variando entre ${formatLux(light.min)} e ${formatLux(light.max)}"
            } else {
                ""
            }
            sentences += "Quanto à luz, $descriptor$minMax."
        }
        groups?.computeTrend("light")?.let { trend ->
            if (trend.isRelevant(30.0)) {
                val direction = if (trend.delta > 0) "aumentou" else "diminuiu"
                sentences += "A iluminação $direction de ${formatLux(trend.start)} para ${formatLux(trend.end)}, indicando mudança de fonte de luz ou abertura de janelas."
            }
        }
    }

    (stats["motion"] as? JsonObject)?.let { motion ->
        val ratio = motion["ratio"].asDoubleOrNull()
        val events = motion["events"].asIntLike()
        val samples = motion["samples"].asIntLike()
        val base = when {
            ratio == null -> null
            ratio >= 0.8 -> "O sensor registrou atividade praticamente contínua, com movimento em ${percent(ratio)} das amostras."
            ratio >= 0.4 -> "Houve presença frequente no ambiente, alcançando ${percent(ratio)} das leituras."
            ratio >= 0.1 -> "O movimento apareceu de forma pontual, com ${percent(ratio)} das amostras ativas."
            else -> "Quase não houve movimento detectado (${percent(ratio)} das amostras)."
        }
        base?.let {
            val detail = if (events != null && samples != null && samples > 0) " Foram ${events} eventos em ${samples} coletas." else ""
            sentences += it + detail
        }
    }

    val totalReadings = obj["totalReadings"].asIntLike()
    val rawCount = obj["rawCount"].asIntLike()
    val aggregatedCount = obj["aggregatedCount"].asIntLike()
    if (totalReadings != null && totalReadings > 0) {
        val detail = if (aggregatedCount != null && aggregatedCount > 0 && rawCount != null) {
            " Inclui ${rawCount} leituras brutas e ${aggregatedCount} pontos agregados."
        } else {
            ""
        }
        sentences += "O relatório considerou ${totalReadings} medições consecutivas.$detail"
    }

    if (sentences.isEmpty()) return null
    return sentences.joinToString(" ")
}

private data class MetricAggregate(
    val avg: Double?,
    val min: Double?,
    val max: Double?,
    val median: Double?,
    val std: Double?
)

private data class TrendInfo(
    val delta: Double,
    val start: Double?,
    val end: Double?
)

private fun MetricAggregate.amplitude(): Double? {
    if (min == null || max == null) return null
    return max - min
}

private fun JsonObject.metricAggregate(key: String): MetricAggregate? {
    val metric = this[key] as? JsonObject ?: return null
    return MetricAggregate(
        avg = metric["avg"].asDoubleOrNull(),
        min = metric["min"].asDoubleOrNull(),
        max = metric["max"].asDoubleOrNull(),
        median = metric["median"].asDoubleOrNull(),
        std = metric["std"].asDoubleOrNull()
    )
}

private fun List<JsonObject>.computeTrend(metricKey: String): TrendInfo? {
    if (isEmpty()) return null
    val values = mapNotNull { group ->
        val stats = group["stats"] as? JsonObject ?: return@mapNotNull null
        stats.metricAggregate(metricKey)?.avg
    }
    if (values.size < 2) return null
    val first = values.first()
    val last = values.last()
    return TrendInfo(delta = last - first, start = first, end = last)
}

private fun TrendInfo.isRelevant(threshold: Double): Boolean {
    return abs(delta) >= threshold && start != null && end != null
}

private fun JsonElement?.asDoubleOrNull(): Double? {
    val primitive = this as? JsonPrimitive ?: return null
    primitive.doubleOrNull?.let { return it }
    primitive.contentOrNull?.toDoubleOrNull()?.let { return it }
    return null
}

private fun JsonElement?.asIntLike(): Int? {
    val primitive = this as? JsonPrimitive ?: return null
    primitive.intOrNull?.let { return it }
    primitive.longOrNull?.let { return it.toInt() }
    primitive.doubleOrNull?.let { return it.roundToInt() }
    primitive.contentOrNull?.toIntOrNull()?.let { return it }
    return null
}

private fun JsonElement?.asLongOrNull(): Long? {
    val primitive = this as? JsonPrimitive ?: return null
    primitive.longOrNull?.let { return it }
    primitive.doubleOrNull?.let { return it.toLong() }
    primitive.contentOrNull?.toLongOrNull()?.let { return it }
    return null
}

private fun formatTemp(value: Double?): String {
    return value?.let { String.format(Locale.getDefault(), "%.1f°C", it) } ?: "—"
}

private fun formatHumidity(value: Double?): String {
    return value?.let { String.format(Locale.getDefault(), "%.0f%%", it) } ?: "—"
}

private fun formatLux(value: Double?): String {
    return value?.let { String.format(Locale.getDefault(), "%.0f lx", it) } ?: "—"
}

private fun percent(ratio: Double): String {
    return "${(ratio * 100).roundToInt()}%"
}

private fun formatTimeWindow(from: Long?, to: Long?): String? {
    if (from == null || to == null) return null
    val start = Instant.ofEpochMilli(from).atZone(ZoneId.systemDefault())
    val end = Instant.ofEpochMilli(to).atZone(ZoneId.systemDefault())
    val startLabel = sensorTimeFormatter.format(start)
    val endLabel = sensorTimeFormatter.format(end)
    return if (start.toLocalDate() == end.toLocalDate()) {
        "$startLabel e $endLabel"
    } else {
        val startDate = sensorDateLabelFormatter.format(start)
        val endDate = sensorDateLabelFormatter.format(end)
        "$startLabel (${startDate}) e $endLabel (${endDate})"
    }
}

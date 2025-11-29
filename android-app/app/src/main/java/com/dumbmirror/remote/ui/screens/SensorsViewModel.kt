package com.dumbmirror.remote.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dumbmirror.remote.AppGraph
import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.data.remote.RelayClient
import com.dumbmirror.remote.data.remote.toJsonElement
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.SensorReading
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

private val prettyJson = Json { prettyPrint = true }

data class SensorsUiState(
    val config: ConnectionConfig = ConnectionConfig(),
    val isConfigured: Boolean = false,
    val connectionSummary: String = "Conexão não configurada.",
    val supportsDataFetch: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val latest: SensorReading? = null,
    val summaryText: String? = null,
    val summaryForwardedAt: Long? = null,
    val summaryReceivedAt: Long? = null,
    val summaryRaw: JsonElement? = null,
    val reportText: String? = null,
    val reportForwardedAt: Long? = null,
    val reportReceivedAt: Long? = null,
    val reportRaw: JsonElement? = null,
    val lastUpdatedAt: Long? = null
)

class SensorsViewModel(
    private val connectionRepository: ConnectionRepository,
    private val relayClient: RelayClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(SensorsUiState())
    val uiState: StateFlow<SensorsUiState> = _uiState.asStateFlow()
    private var eventsJob: Job? = null

    init {
        viewModelScope.launch {
            connectionRepository.observeConfig().collectLatest { config ->
                _uiState.update { state ->
                    state.copy(
                        config = config,
                        isConfigured = config.isConfigured,
                        connectionSummary = describeConfig(config),
                        supportsDataFetch = config.mode == ConnectionMode.RELAY && config.relay.isConfigured
                    )
                }
                subscribeToRealtime(config)
                if (config.mode == ConnectionMode.RELAY && config.relay.isConfigured) {
                    refreshSensorsInternal(config, showLoading = true)
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            latest = null,
                            summaryText = null,
                            summaryForwardedAt = null,
                            summaryReceivedAt = null,
                            summaryRaw = null,
                            reportText = null,
                            reportForwardedAt = null,
                            reportReceivedAt = null,
                            reportRaw = null,
                            lastUpdatedAt = null
                        )
                    }
                }
            }
        }
    }

    fun refreshSensors() {
        val currentConfig = _uiState.value.config
        if (!currentConfig.isConfigured) {
            _uiState.update {
                it.copy(errorMessage = "Configure a conexão na aba Dashboard para visualizar os sensores.")
            }
            return
        }
        if (currentConfig.mode != ConnectionMode.RELAY) {
            _uiState.update {
                it.copy(errorMessage = "Visualização de sensores via conexão LAN ainda não está disponível.")
            }
            return
        }
        viewModelScope.launch {
            refreshSensorsInternal(currentConfig, showLoading = true)
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private suspend fun refreshSensorsInternal(config: ConnectionConfig, showLoading: Boolean) {
        if (showLoading) {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        } else {
            _uiState.update { it.copy(errorMessage = null) }
        }
        val details = config.relay
        val token = details.accessToken ?: run {
            _uiState.update { it.copy(isLoading = false, errorMessage = "Token de acesso ausente.") }
            return
        }
        val mirrorId = details.mirrorId ?: run {
            _uiState.update { it.copy(isLoading = false, errorMessage = "Mirror ID ausente.") }
            return
        }
        val dataSource = AppGraph.provideRelayRemoteDataSource(details.baseUrl)

        val latestResult = dataSource.getSensorLatest(token, mirrorId)
        val summaryResult = dataSource.getSensorSummary(token, mirrorId)
        val reportResult = dataSource.getSensorReport(token, mirrorId)

        val failure = latestResult.exceptionOrNull()
            ?: summaryResult.exceptionOrNull()
            ?: reportResult.exceptionOrNull()

        if (failure != null) {
            _uiState.update {
                it.copy(
                    isLoading = false,
                    errorMessage = failure.message ?: "Falha ao carregar dados dos sensores."
                )
            }
            return
        }

        val latest = latestResult.getOrNull()
        val summary = summaryResult.getOrNull()
        val report = reportResult.getOrNull()

        _uiState.update {
            it.copy(
                isLoading = false,
                errorMessage = null,
                latest = latest,
                summaryText = summary?.data?.let { element -> formatJson(element) },
                summaryForwardedAt = summary?.forwardedAt,
                summaryReceivedAt = summary?.receivedAt,
                summaryRaw = summary?.data,
                reportText = report?.data?.let { element -> formatJson(element) },
                reportForwardedAt = report?.forwardedAt,
                reportReceivedAt = report?.receivedAt,
                reportRaw = report?.data,
                lastUpdatedAt = System.currentTimeMillis()
            )
        }
    }

    private fun subscribeToRealtime(config: ConnectionConfig) {
        eventsJob?.cancel()
        if (config.mode != ConnectionMode.RELAY || !config.relay.isConfigured) {
            eventsJob = null
            return
        }
        eventsJob = viewModelScope.launch {
            relayClient.observe(config.relay)
                .catch { error ->
                    _uiState.update {
                        it.copy(errorMessage = error.message ?: "Falha no canal em tempo real.")
                    }
                }
                .collect { event ->
                    when (event.type) {
                        "mirror-event" -> handleMirrorEvent(event.data)
                        "mirror-status" -> handleMirrorStatus(event.data)
                        "socket-error" -> handleSocketEvent(event.data)
                    }
                }
        }
    }

    private fun handleMirrorEvent(data: Map<String, Any?>) {
        val notification = data["notification"] as? String ?: return
        when (notification) {
            "SENSORDATA_REMOTE_UPDATE" -> applySensorReading(data)
            "SENSORDATA_SUMMARY" -> applySensorSummary(data)
            "SENSORDATA_REPORT_BROADCAST" -> applySensorReport(data)
        }
    }

    private fun handleMirrorStatus(data: Map<String, Any?>) {
        val online = data["online"] as? Boolean ?: return
        val state = _uiState.value
        val base = describeConfig(state.config)
        val summary = if (state.config.mode == ConnectionMode.RELAY) {
            "$base · status: ${if (online) "online" else "offline"}"
        } else base
        _uiState.update {
            it.copy(connectionSummary = summary)
        }
    }

    private fun handleSocketEvent(data: Map<String, Any?>) {
        val message = data["message"] as? String ?: return
        _uiState.update { it.copy(errorMessage = message) }
    }

    private fun applySensorReading(data: Map<String, Any?>) {
        val payload = data["payload"] as? Map<String, Any?> ?: return
        val reading = SensorReading(
            timestampMs = payload.longValue("ts") ?: data.longValue("forwardedAt"),
            temperatureC = payload.doubleValue("temperature"),
            humidityPercent = payload.doubleValue("humidity"),
            lightLux = payload.doubleValue("light"),
            motionFlag = payload.booleanValue("motion"),
            motionRaw = payload["motion"]?.toString(),
            forwardedAt = data.longValue("forwardedAt"),
            receivedAt = data.longValue("receivedAt"),
            sender = data["sender"] as? String
        )
        _uiState.update {
            it.copy(
                latest = reading,
                lastUpdatedAt = System.currentTimeMillis(),
                isLoading = false,
                errorMessage = null
            )
        }
    }

    private fun applySensorSummary(data: Map<String, Any?>) {
        val payload = data["payload"] ?: return
        val jsonElement = payload.toJsonElement()
        _uiState.update {
            it.copy(
                summaryRaw = jsonElement,
                summaryText = formatJson(jsonElement),
                summaryForwardedAt = data.longValue("forwardedAt"),
                summaryReceivedAt = data.longValue("receivedAt"),
                lastUpdatedAt = System.currentTimeMillis()
            )
        }
    }

    private fun applySensorReport(data: Map<String, Any?>) {
        val payload = data["payload"] ?: return
        val jsonElement = payload.toJsonElement()
        _uiState.update {
            it.copy(
                reportRaw = jsonElement,
                reportText = formatJson(jsonElement),
                reportForwardedAt = data.longValue("forwardedAt"),
                reportReceivedAt = data.longValue("receivedAt"),
                lastUpdatedAt = System.currentTimeMillis()
            )
        }
    }

    private fun describeConfig(config: ConnectionConfig): String {
        if (!config.isConfigured) {
            return "Conexão não configurada."
        }
        return when (config.mode) {
            ConnectionMode.LAN -> "LAN: ${config.baseUrl}"
            ConnectionMode.RELAY -> {
                val label = config.relay.mirrorName ?: config.relay.mirrorId ?: "?"
                "Relay: ${config.relay.baseUrl} · espelho ${label}"
            }
        }
    }

    private fun formatJson(element: JsonElement?): String? {
        if (element == null || element is JsonNull) {
            return null
        }
        return prettyJson.encodeToString(JsonElement.serializer(), element)
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                SensorsViewModel(
                    connectionRepository = AppGraph.connectionRepository,
                    relayClient = AppGraph.relayClient
                )
            }
        }
    }
}

private fun Map<String, Any?>.doubleValue(key: String): Double? = this[key].asDouble()
private fun Map<String, Any?>.longValue(key: String): Long? = this[key].asLong()
private fun Map<String, Any?>.booleanValue(key: String): Boolean? = this[key].asBoolean()

private fun Any?.asDouble(): Double? = when (this) {
    is Number -> this.toDouble()
    is String -> this.toDoubleOrNull()
    else -> null
}

private fun Any?.asLong(): Long? = when (this) {
    is Number -> this.toLong()
    is String -> this.toLongOrNull()
    else -> null
}

private fun Any?.asBoolean(): Boolean? = when (this) {
    is Boolean -> this
    is Number -> this.toInt() != 0
    is String -> when {
        equals("true", ignoreCase = true) -> true
        equals("false", ignoreCase = true) -> false
        this == "1" -> true
        this == "0" -> false
        else -> null
    }
    else -> null
}

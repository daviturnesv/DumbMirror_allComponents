package com.dumbmirror.remote.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dumbmirror.remote.AppGraph
import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.SensorReading
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
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
    private val connectionRepository: ConnectionRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SensorsUiState())
    val uiState: StateFlow<SensorsUiState> = _uiState.asStateFlow()

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
                    connectionRepository = AppGraph.connectionRepository
                )
            }
        }
    }
}

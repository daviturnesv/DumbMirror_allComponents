package com.dumbmirror.remote.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dumbmirror.remote.AppGraph
import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.data.remote.RemoteGatewayFactory
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RemoteCommandUiState(
    val config: ConnectionConfig = ConnectionConfig(),
    val isConfigured: Boolean = false,
    val connectionSummary: String = "Conexão não configurada.",
    val isSending: Boolean = false,
    val statusMessage: String? = null,
    val errorMessage: String? = null,
    val lastNotification: String? = null,
    val commandSequence: Int = 0
)

class RemoteCommandViewModel(
    private val connectionRepository: ConnectionRepository,
    private val remoteGatewayFactory: RemoteGatewayFactory
) : ViewModel() {

    private val _uiState = MutableStateFlow(RemoteCommandUiState())
    val uiState: StateFlow<RemoteCommandUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            connectionRepository.observeConfig().collectLatest { config ->
                _uiState.update { state ->
                    state.copy(
                        config = config,
                        isConfigured = config.isConfigured,
                        connectionSummary = describeConfig(config)
                    )
                }
            }
        }
    }

    fun sendCommand(
        notification: String,
        payload: Map<String, Any?> = emptyMap(),
        successMessage: String? = null
    ) {
        val currentConfig = _uiState.value.config
        if (!currentConfig.isConfigured) {
            _uiState.update {
                it.copy(errorMessage = "Configure a conexão na aba Dashboard antes de enviar comandos.")
            }
            return
        }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isSending = true,
                    statusMessage = null,
                    errorMessage = null,
                    lastNotification = notification
                )
            }
            val gateway = try {
                remoteGatewayFactory.create(currentConfig)
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isSending = false,
                        errorMessage = ex.message ?: "Falha ao preparar a conexão com o espelho.",
                        lastNotification = notification,
                        commandSequence = it.commandSequence + 1
                    )
                }
                return@launch
            }

            val result = gateway.sendCommand(notification, payload)
            _uiState.update { state ->
                if (result.isSuccess) {
                    state.copy(
                        isSending = false,
                        statusMessage = successMessage ?: "Comando enviado com sucesso.",
                        errorMessage = null,
                        lastNotification = notification,
                        commandSequence = state.commandSequence + 1
                    )
                } else {
                    val errorText = result.exceptionOrNull()?.message?.takeIf { it.isNotBlank() }
                        ?: "Falha ao enviar o comando."
                    state.copy(
                        isSending = false,
                        statusMessage = null,
                        errorMessage = errorText,
                        lastNotification = notification,
                        commandSequence = state.commandSequence + 1
                    )
                }
            }
        }
    }

    fun clearFeedback() {
        _uiState.update { it.copy(statusMessage = null, errorMessage = null) }
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

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                RemoteCommandViewModel(
                    connectionRepository = AppGraph.connectionRepository,
                    remoteGatewayFactory = AppGraph.remoteGatewayFactory
                )
            }
        }
    }
}

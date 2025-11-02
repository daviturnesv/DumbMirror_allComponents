package com.dumbmirror.remote.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dumbmirror.remote.AppGraph
import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.data.local.RelayAccountRepository
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.data.remote.RelayRemoteDataSource
import com.dumbmirror.remote.domain.usecase.SaveConnectionConfigUseCase
import com.dumbmirror.remote.domain.usecase.TestConnectionUseCase
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.RelayDefaults
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class DashboardViewModel(
    private val connectionRepository: ConnectionRepository,
    private val relayAccountRepository: RelayAccountRepository,
    private val saveConnectionUseCase: SaveConnectionConfigUseCase,
    private val testConnectionUseCase: TestConnectionUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            connectionRepository.observeConfig().collectLatest { config ->
                _uiState.update { state ->
                    state.copy(
                        config = config,
                        draftMode = if (state.isDialogOpen) state.draftMode else config.mode,
                        draftBaseUrl = if (state.isDialogOpen) state.draftBaseUrl else config.baseUrl,
                        draftToken = if (state.isDialogOpen) state.draftToken else config.token.orEmpty(),
                        draftRelayBaseUrl = if (state.isDialogOpen) state.draftRelayBaseUrl else config.relay.baseUrl.ifBlank { RelayDefaults.DEFAULT_BASE_URL },
                        draftRelayToken = if (state.isDialogOpen) state.draftRelayToken else config.relay.accessToken.orEmpty(),
                        draftRelayMirrorId = if (state.isDialogOpen) state.draftRelayMirrorId else config.relay.mirrorId.orEmpty()
                    )
                }
            }
        }

        // Pré-carrega dados de conta/sessão do Relay (email/token/mirror)
        viewModelScope.launch {
            relayAccountRepository.observeAccount().collectLatest { acc ->
                _uiState.update { state ->
                    // Preenche rascunhos apenas quando o diálogo não está aberto para não sobrescrever edição
                    state.copy(
                        relayEmail = acc.email.ifBlank { state.relayEmail },
                        draftRelayBaseUrl = if (state.isDialogOpen) state.draftRelayBaseUrl else acc.baseUrl.ifBlank { state.draftRelayBaseUrl.ifBlank { RelayDefaults.DEFAULT_BASE_URL } },
                        draftRelayToken = if (state.isDialogOpen) state.draftRelayToken else (acc.accessToken ?: state.draftRelayToken),
                        draftRelayMirrorId = if (state.isDialogOpen) state.draftRelayMirrorId else (acc.mirrorId ?: state.draftRelayMirrorId)
                    )
                }
            }
        }
    }

    fun openConfigDialog() {
        _uiState.update { state ->
            state.copy(
                isDialogOpen = true,
                draftMode = state.config.mode,
                draftBaseUrl = state.config.baseUrl,
                draftToken = state.config.token.orEmpty(),
                draftRelayBaseUrl = state.config.relay.baseUrl.ifBlank { RelayDefaults.DEFAULT_BASE_URL },
                draftRelayToken = state.config.relay.accessToken.orEmpty(),
                draftRelayMirrorId = state.config.relay.mirrorId.orEmpty(),
                message = null
            )
        }
    }

    fun dismissConfigDialog() {
        _uiState.update { it.copy(isDialogOpen = false, message = null) }
    }

    fun updateDraftBaseUrl(value: String) {
        _uiState.update { it.copy(draftBaseUrl = value) }
    }

    fun updateDraftToken(value: String) {
        _uiState.update { it.copy(draftToken = value) }
    }

    fun updateDraftMode(mode: ConnectionMode) {
        _uiState.update { it.copy(draftMode = mode) }
    }

    fun updateDraftRelayBaseUrl(value: String) {
        _uiState.update { it.copy(draftRelayBaseUrl = value) }
    }

    fun updateDraftRelayToken(value: String) {
        _uiState.update { it.copy(draftRelayToken = value) }
    }

    fun updateDraftRelayMirrorId(value: String) {
        _uiState.update { it.copy(draftRelayMirrorId = value) }
    }

    fun saveConfig() {
        val state = _uiState.value
        val config = when (state.draftMode) {
            ConnectionMode.LAN -> {
                val draftUrl = state.draftBaseUrl.trim()
                if (draftUrl.isEmpty()) {
                    _uiState.update { it.copy(message = "Informe o endereço do espelho.") }
                    return
                }
                ConnectionConfig.fromParts(draftUrl, state.draftToken)
            }
            ConnectionMode.RELAY -> {
                val relayHostInput = state.draftRelayBaseUrl.trim().ifEmpty { RelayDefaults.DEFAULT_BASE_URL }
                val relayHost = RelayDefaults.normalizeBaseUrl(relayHostInput)
                val mirrorId = state.draftRelayMirrorId.trim()
                if (relayHost.isEmpty() || mirrorId.isEmpty()) {
                    _uiState.update { it.copy(message = "Informe o endereço do Relay e o ID do espelho.") }
                    return
                }
                val relayToken = state.draftRelayToken.trim().ifEmpty { null }
                ConnectionConfig.fromRelay(relayHost, relayToken, mirrorId)
            }
        }
        viewModelScope.launch {
            saveConnectionUseCase(config)
            _uiState.update {
                it.copy(
                    isDialogOpen = false,
                    message = "Configuração salva.",
                    config = config,
                    draftRelayBaseUrl = if (config.mode == ConnectionMode.RELAY) config.relay.baseUrl else it.draftRelayBaseUrl
                )
            }
        }
    }

    

    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
    }

    // Relay: Login
    fun openLoginDialog() {
        _uiState.update { it.copy(isLoginDialogOpen = true, loginEmail = "", loginPassword = "") }
    }

    fun dismissLoginDialog() {
        _uiState.update { it.copy(isLoginDialogOpen = false) }
    }

    fun updateLoginEmail(value: String) {
        _uiState.update { it.copy(loginEmail = value) }
    }

    fun updateLoginPassword(value: String) {
        _uiState.update { it.copy(loginPassword = value) }
    }

    fun performRelayLogin() {
        val baseInput = _uiState.value.draftRelayBaseUrl.trim()
        val email = _uiState.value.loginEmail.trim()
        val password = _uiState.value.loginPassword
        if (email.isEmpty() || password.isEmpty()) {
            _uiState.update { it.copy(message = "Informe email e senha.") }
            return
        }
        val normalizedBase = RelayDefaults.normalizeBaseUrl(baseInput.ifEmpty { RelayDefaults.DEFAULT_BASE_URL })
        if (normalizedBase.isEmpty()) {
            _uiState.update { it.copy(message = "Endereço do Relay inválido.") }
            return
        }
        viewModelScope.launch {
            val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(normalizedBase)
            val result = ds.login(email, password)
            _uiState.update { state ->
                if (result.isSuccess) {
                    val session = result.getOrNull()!!
                    val tokenPreview = if (session.token.length > 14) session.token.take(8) + "…" + session.token.takeLast(6) else session.token
                    val newState = state.copy(
                        isLoginDialogOpen = false,
                        draftRelayBaseUrl = normalizedBase,
                        // Atualiza o token e limpa o MirrorId para evitar ficar com um ID antigo de outra conta
                        draftRelayToken = session.token,
                        draftRelayMirrorId = "",
                        draftMode = ConnectionMode.RELAY,
                        relayEmail = session.user.email,
                        message = "Login no Relay bem-sucedido (token: $tokenPreview). Selecione um espelho e salvaremos a configuração automaticamente."
                    )
                    // Persistimos token imediatamente na ConnectionConfig e também na RelayAccount
                    viewModelScope.launch {
                        val currentMirrorId = newState.draftRelayMirrorId.ifBlank { null }
                        val newConfig = ConnectionConfig.fromRelay(normalizedBase, session.token, currentMirrorId)
                        saveConnectionUseCase(newConfig)
                        relayAccountRepository.saveAccount(
                            com.dumbmirror.remote.domain.model.RelayAccount(
                                baseUrl = normalizedBase,
                                email = session.user.email,
                                accessToken = session.token,
                                mirrorId = currentMirrorId,
                                mirrorName = null
                            )
                        )
                        // Reflete imediatamente no estado local para evitar discrepância visual
                        _uiState.update { it.copy(config = newConfig) }
                    }
                    newState
                } else {
                    val ex = result.exceptionOrNull()
                    val msg = ex?.message ?: ex?.toString() ?: "Falha no login do Relay."
                    state.copy(message = msg)
                }
            }
        }
    }

    // Verifica qual usuário está associado ao token atual via /api/auth/me
    fun verifyRelayToken() {
        val baseInput = _uiState.value.draftRelayBaseUrl.trim()
        val token = _uiState.value.draftRelayToken.trim()
        if (token.isEmpty()) {
            _uiState.update { it.copy(message = "Informe token para verificar.") }
            return
        }
        val normalizedBase = RelayDefaults.normalizeBaseUrl(baseInput.ifEmpty { RelayDefaults.DEFAULT_BASE_URL })
        if (normalizedBase.isEmpty()) {
            _uiState.update { it.copy(message = "Endereço do Relay inválido.") }
            return
        }
        viewModelScope.launch {
            val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(normalizedBase)
            val result = ds.whoAmI(token)
            _uiState.update { state ->
                if (result.isSuccess) {
                    val user = result.getOrNull()!!
                    state.copy(
                        relayEmail = user.email,
                        draftRelayBaseUrl = normalizedBase,
                        message = "Token pertence a: ${user.email}"
                    )
                } else {
                    val ex = result.exceptionOrNull()
                    val msg = ex?.message ?: ex?.toString() ?: "Falha ao verificar token."
                    state.copy(message = msg)
                }
            }
        }
    }

    fun performRelayRegister() {
        val baseInput = _uiState.value.draftRelayBaseUrl.trim()
        val email = _uiState.value.loginEmail.trim()
        val password = _uiState.value.loginPassword
        if (email.isEmpty() || password.isEmpty()) {
            _uiState.update { it.copy(message = "Informe email e senha.") }
            return
        }
        val normalizedBase = RelayDefaults.normalizeBaseUrl(baseInput.ifEmpty { RelayDefaults.DEFAULT_BASE_URL })
        if (normalizedBase.isEmpty()) {
            _uiState.update { it.copy(message = "Endereço do Relay inválido.") }
            return
        }
        viewModelScope.launch {
            val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(normalizedBase)
            val result = ds.register(email, password)
            _uiState.update { state ->
                if (result.isSuccess) {
                    val session = result.getOrNull()!!
                    state.copy(
                        isLoginDialogOpen = false,
                        draftRelayBaseUrl = normalizedBase,
                        draftRelayToken = session.token,
                        message = "Conta criada e autenticada no Relay."
                    )
                } else {
                    val ex = result.exceptionOrNull()
                    val msg = ex?.message ?: ex?.toString() ?: "Falha ao criar conta no Relay."
                    state.copy(message = msg)
                }
            }
        }
    }

    // Relay: Mirrors
    fun openMirrorPicker() {
        val baseInput = _uiState.value.draftRelayBaseUrl.trim()
        val token = _uiState.value.draftRelayToken.trim()
        if (token.isEmpty()) {
            _uiState.update { it.copy(message = "Faça login no Relay antes de listar espelhos.") }
            return
        }
        val normalizedBase = RelayDefaults.normalizeBaseUrl(baseInput.ifEmpty { RelayDefaults.DEFAULT_BASE_URL })
        if (normalizedBase.isEmpty()) {
            _uiState.update { it.copy(message = "Endereço do Relay inválido.") }
            return
        }
        viewModelScope.launch {
            val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(normalizedBase)
            val result = ds.listMirrors(token)
            _uiState.update { state ->
                if (result.isSuccess) {
                    val list = result.getOrNull() ?: emptyList()
                    // Ordena: online primeiro, depois por nome
                    val sorted = list.sortedWith(compareByDescending<com.dumbmirror.remote.domain.model.RelayMirror> { it.online }.thenBy { it.name.lowercase() })
                    state.copy(
                        isMirrorPickerOpen = true,
                        mirrors = sorted,
                        mirrorPickerMessage = null,
                        isCreateSectionExpanded = false,
                        draftRelayBaseUrl = normalizedBase
                    )
                } else {
                    val ex = result.exceptionOrNull()
                    val msg = ex?.message ?: ex?.toString() ?: "Falha ao carregar espelhos."
                    state.copy(isMirrorPickerOpen = true, mirrorPickerMessage = msg, isCreateSectionExpanded = false)
                }
            }
        }
    }

    fun dismissMirrorPicker() {
        _uiState.update { it.copy(isMirrorPickerOpen = false, mirrorPickerMessage = null, isCreatingMirror = false, isCreateSectionExpanded = false) }
    }

    fun selectMirror(mirrorId: String, mirrorName: String) {
        // Atualiza o draft imediatamente para refletir na UI
        _uiState.update { it.copy(draftRelayMirrorId = mirrorId, isMirrorPickerOpen = false) }
        // Se já tivermos host e token do Relay, persistimos automaticamente a configuração
        val stateNow = _uiState.value
        val relayHostInput = stateNow.draftRelayBaseUrl.trim().ifEmpty { RelayDefaults.DEFAULT_BASE_URL }
        val relayHost = RelayDefaults.normalizeBaseUrl(relayHostInput)
        val relayToken = stateNow.draftRelayToken.trim()
        if (relayHost.isNotEmpty() && relayToken.isNotEmpty()) {
            viewModelScope.launch {
                val newConfig = ConnectionConfig.fromRelay(relayHost, relayToken, mirrorId, mirrorName)
                saveConnectionUseCase(newConfig)
                relayAccountRepository.saveAccount(
                    com.dumbmirror.remote.domain.model.RelayAccount(
                        baseUrl = relayHost,
                        email = _uiState.value.relayEmail ?: "",
                        accessToken = relayToken,
                        mirrorId = mirrorId,
                        mirrorName = mirrorName
                    )
                )
                _uiState.update {
                    it.copy(
                        config = newConfig,
                        draftRelayBaseUrl = relayHost,
                        // Mantém o diálogo aberto, mas já informa que aplicou
                        message = "Espelho selecionado: $mirrorName. Configuração atualizada automaticamente.")
                }
            }
        } else {
            _uiState.update { it.copy(message = "Espelho selecionado: $mirrorName") }
        }
    }

    fun createMirror(name: String) {
        val baseInput = _uiState.value.draftRelayBaseUrl.trim()
        val token = _uiState.value.draftRelayToken.trim()
        if (token.isEmpty()) {
            _uiState.update { it.copy(message = "Faça login no Relay antes de criar espelho.") }
            return
        }
        val normalizedBase = RelayDefaults.normalizeBaseUrl(baseInput.ifEmpty { RelayDefaults.DEFAULT_BASE_URL })
        if (normalizedBase.isEmpty()) {
            _uiState.update { it.copy(message = "Endereço do Relay inválido.") }
            return
        }
        val mirrorName = name.ifBlank { "Meu Espelho" }
        viewModelScope.launch {
            _uiState.update { it.copy(isCreatingMirror = true, mirrorPickerMessage = null) }
            val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(normalizedBase)
            val result = ds.createMirror(token, mirrorName)
            _uiState.update { state ->
                val baseState = state.copy(isCreatingMirror = false)
                if (result.isSuccess) {
                    val created = result.getOrNull()!!
                    val updated = baseState.copy(
                        draftRelayMirrorId = created.mirror.id,
                        mirrors = listOf(created.mirror) + state.mirrors,
                        mirrorPickerMessage = "Espelho criado: ${created.mirror.name}. ID: ${created.mirror.id}. Secret: ${created.secret}. Configure no MMM-RemoteRelay e reinicie o MagicMirror.",
                        isCreateSectionExpanded = false,
                        draftRelayBaseUrl = normalizedBase
                    )
                    // Persistimos imediatamente a nova seleção se já houver token/base
                    viewModelScope.launch {
                        val relayHostNow = updated.draftRelayBaseUrl.trim()
                        val relayTokenNow = updated.draftRelayToken.trim()
                        if (relayHostNow.isNotEmpty() && relayTokenNow.isNotEmpty()) {
                            val normalizedHostNow = RelayDefaults.normalizeBaseUrl(relayHostNow)
                            val cfg = ConnectionConfig.fromRelay(normalizedHostNow, relayTokenNow, created.mirror.id, created.mirror.name)
                            saveConnectionUseCase(cfg)
                            relayAccountRepository.saveAccount(
                                com.dumbmirror.remote.domain.model.RelayAccount(
                                    baseUrl = normalizedHostNow,
                                    email = _uiState.value.relayEmail ?: "",
                                    accessToken = relayTokenNow,
                                    mirrorId = created.mirror.id,
                                    mirrorName = created.mirror.name
                                )
                            )
                            _uiState.update { it.copy(config = cfg, draftRelayBaseUrl = normalizedHostNow) }
                        }
                    }
                    updated
                } else {
                    val ex = result.exceptionOrNull()
                    val msg = ex?.message ?: ex?.toString() ?: "Falha ao criar espelho."
                    baseState.copy(mirrorPickerMessage = msg)
                }
            }
        }
    }

    // Seleciona por ID manualmente. Útil quando você já vê o ID no MagicMirror mas não lembra a conta.
    fun selectMirrorByIdManual(id: String) {
        val baseInput = _uiState.value.draftRelayBaseUrl.trim()
        val token = _uiState.value.draftRelayToken.trim()
        val mirrorId = id.trim()
        if (token.isEmpty() || mirrorId.isEmpty()) {
            _uiState.update { it.copy(mirrorPickerMessage = "Informe token e o ID do espelho.") }
            return
        }
        val normalizedBase = RelayDefaults.normalizeBaseUrl(baseInput.ifEmpty { RelayDefaults.DEFAULT_BASE_URL })
        if (normalizedBase.isEmpty()) {
            _uiState.update { it.copy(mirrorPickerMessage = "Endereço do Relay inválido.") }
            return
        }
        viewModelScope.launch {
            val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(normalizedBase)
            val result = ds.getMirrorStatus(token, mirrorId)
            _uiState.update { state ->
                if (result.isSuccess) {
                    val m = result.getOrNull()!!
                    // Mesmo que esteja offline, podemos salvar a seleção; o objetivo aqui é alinhar o ID correto
                    selectMirror(mirrorId, m.name)
                    state.copy(
                        mirrorPickerMessage = "Espelho ${m.name} selecionado por ID.",
                        draftRelayBaseUrl = normalizedBase
                    )
                } else {
                    val msg = result.exceptionOrNull()?.message ?: "Não foi possível acessar este ID. Pode pertencer a outra conta. Tente entrar com outra conta e repetir."
                    state.copy(mirrorPickerMessage = msg)
                }
            }
        }
    }

    fun toggleCreateSection(expanded: Boolean) {
        _uiState.update { it.copy(isCreateSectionExpanded = expanded) }
    }

    fun logoutRelay() {
        viewModelScope.launch {
            relayAccountRepository.clearAccount()
            val base = _uiState.value.draftRelayBaseUrl
            val normalizedBase = RelayDefaults.normalizeBaseUrl(base.ifBlank { RelayDefaults.DEFAULT_BASE_URL })
            val cleared = ConnectionConfig.fromRelay(normalizedBase, null, null)
            saveConnectionUseCase(cleared)
            _uiState.update {
                it.copy(
                    config = cleared,
                    draftRelayBaseUrl = normalizedBase.ifBlank { RelayDefaults.DEFAULT_BASE_URL },
                    relayEmail = null,
                    draftRelayToken = "",
                    draftRelayMirrorId = "",
                    message = "Sessão finalizada."
                )
            }
        }
    }

    // Testar conexão, com tratamento rápido para 401 e enriquecimento de status em modo RELAY
    fun testConnection() {
        val config = _uiState.value.config
        if (!config.isConfigured) {
            _uiState.update { it.copy(message = "Configure o endereço antes de testar.") }
            return
        }
        _uiState.update { it.copy(isTesting = true, message = null, lastTest = null) }
        viewModelScope.launch {
            val result = testConnectionUseCase(config)
            if (result.isSuccess) {
                // Em RELAY, buscamos status detalhado (online/lastSeen)
                if (config.mode == ConnectionMode.RELAY) {
                    val ds: RelayRemoteDataSource = AppGraph.provideRelayRemoteDataSource(config.relay.normalizedBaseUrl())
                    val token = config.relay.accessToken ?: ""
                    val mirrorId = config.relay.mirrorId ?: ""
                    val statusResult = ds.getMirrorStatus(token, mirrorId)
                    _uiState.update { state ->
                        if (statusResult.isSuccess) {
                            val mirror = statusResult.getOrNull()!!
                            state.copy(
                                isTesting = false,
                                lastTest = ConnectionTestResult.Success,
                                message = if (mirror.online) "Espelho online." else "Espelho offline."
                            )
                        } else {
                            state.copy(isTesting = false, lastTest = ConnectionTestResult.Success, message = "Conexão ok.")
                        }
                    }
                } else {
                    _uiState.update { it.copy(isTesting = false, lastTest = ConnectionTestResult.Success, message = "Conexão bem-sucedida.") }
                }
            } else {
                val ex = result.exceptionOrNull()
                val errorMsg = ex?.message ?: ex?.toString() ?: "Falha na conexão."
                // Tratamento rápido para 401/403
                if (config.mode == ConnectionMode.RELAY && (errorMsg.contains("401") || errorMsg.contains("Unauthorized", ignoreCase = true))) {
                    // Executa logout e pede login novamente
                    logoutRelay()
                    _uiState.update { it.copy(isTesting = false, lastTest = ConnectionTestResult.Error, message = "Token inválido/expirado. Faça login novamente.") }
                } else {
                    _uiState.update { it.copy(isTesting = false, lastTest = ConnectionTestResult.Error, message = errorMsg) }
                }
            }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                DashboardViewModel(
                    connectionRepository = AppGraph.connectionRepository,
                    relayAccountRepository = AppGraph.relayAccountRepository,
                    saveConnectionUseCase = AppGraph.provideSaveConnectionUseCase(),
                    testConnectionUseCase = AppGraph.provideTestConnectionUseCase()
                )
            }
        }
    }
}

data class DashboardUiState(
    val config: ConnectionConfig = ConnectionConfig(),
    val isDialogOpen: Boolean = false,
    val draftMode: ConnectionMode = ConnectionMode.LAN,
    val draftBaseUrl: String = "",
    val draftToken: String = "",
    val draftRelayBaseUrl: String = RelayDefaults.DEFAULT_BASE_URL,
    val draftRelayToken: String = "",
    val draftRelayMirrorId: String = "",
    val relayEmail: String? = null,
    // Relay auxiliary dialogs
    val isLoginDialogOpen: Boolean = false,
    val loginEmail: String = "",
    val loginPassword: String = "",
    val isMirrorPickerOpen: Boolean = false,
    val mirrors: List<com.dumbmirror.remote.domain.model.RelayMirror> = emptyList(),
    val mirrorPickerMessage: String? = null,
    val isCreatingMirror: Boolean = false,
    val isCreateSectionExpanded: Boolean = false,
    val isTesting: Boolean = false,
    val lastTest: ConnectionTestResult? = null,
    val message: String? = null
)

sealed interface ConnectionTestResult {
    data object Success : ConnectionTestResult
    data object Error : ConnectionTestResult
}

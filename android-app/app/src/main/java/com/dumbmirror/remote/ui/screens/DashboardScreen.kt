package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dumbmirror.remote.R
import com.dumbmirror.remote.domain.model.ConnectionMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = viewModel(factory = DashboardViewModel.Factory)
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.message, uiState.isDialogOpen, uiState.isLoginDialogOpen, uiState.isMirrorPickerOpen) {
        // Só mostra Snackbar quando não há nenhum modal aberto; caso contrário, deixamos a mensagem
        // para ser exibida inline dentro do diálogo/mensagem específica.
        val hasModal = uiState.isDialogOpen || uiState.isLoginDialogOpen || uiState.isMirrorPickerOpen
        if (!hasModal) {
            uiState.message?.let { message ->
                snackbarHostState.showSnackbar(message)
                viewModel.clearMessage()
            }
        }
    }

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
            Text(
                text = stringResource(id = R.string.dashboard_title),
                style = MaterialTheme.typography.headlineMedium
            )

            Text(
                text = stringResource(id = R.string.dashboard_description),
                style = MaterialTheme.typography.bodyMedium
            )

            ConnectionStatusSection(
                uiState = uiState,
                onTest = viewModel::testConnection,
                onConfigure = viewModel::openConfigDialog
            )
        }
    }

    if (uiState.isDialogOpen) {
        ConnectionConfigDialog(
            uiState = uiState,
            onDismiss = viewModel::dismissConfigDialog,
            onSave = viewModel::saveConfig,
            onBaseUrlChanged = viewModel::updateDraftBaseUrl,
            onTokenChanged = viewModel::updateDraftToken,
            onModeChanged = viewModel::updateDraftMode,
            onRelayBaseUrlChanged = viewModel::updateDraftRelayBaseUrl,
            onRelayTokenChanged = viewModel::updateDraftRelayToken,
            onRelayMirrorIdChanged = viewModel::updateDraftRelayMirrorId,
            onLogin = viewModel::openLoginDialog,
            onPickMirror = viewModel::openMirrorPicker,
            onVerifyToken = viewModel::verifyRelayToken,
            onLogout = viewModel::logoutRelay
        )
    }

    if (uiState.isLoginDialogOpen) {
        RelayLoginDialog(
            email = uiState.loginEmail,
            password = uiState.loginPassword,
            onEmailChanged = viewModel::updateLoginEmail,
            onPasswordChanged = viewModel::updateLoginPassword,
            onDismiss = viewModel::dismissLoginDialog,
            onConfirm = viewModel::performRelayLogin,
            onRegister = viewModel::performRelayRegister
        )
    }

    if (uiState.isMirrorPickerOpen) {
        MirrorPickerDialog(
            mirrors = uiState.mirrors,
            accountEmail = uiState.relayEmail,
            onDismiss = viewModel::dismissMirrorPicker,
            onSelect = { id, name -> viewModel.selectMirror(id, name) },
            onSelectById = { id -> viewModel.selectMirrorByIdManual(id) },
            isCreateExpanded = uiState.isCreateSectionExpanded,
            onToggleCreate = { expanded -> viewModel.toggleCreateSection(expanded) },
            onCreateMirror = { name -> viewModel.createMirror(name) },
            message = uiState.mirrorPickerMessage,
            isCreating = uiState.isCreatingMirror
        )
    }
}

@Composable
private fun ConnectionStatusSection(
    uiState: DashboardUiState,
    onTest: () -> Unit,
    onConfigure: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        val configuredText = if (uiState.config.isConfigured) {
            if (uiState.config.mode == ConnectionMode.RELAY) {
                val relayBase = uiState.config.relay.baseUrl
                val mirrorLabel = uiState.config.relay.mirrorName ?: uiState.config.relay.mirrorId ?: "?"
                stringResource(id = R.string.dashboard_configured_relay, relayBase, mirrorLabel)
            } else {
                stringResource(id = R.string.dashboard_configured, uiState.config.baseUrl)
            }
        } else {
            stringResource(id = R.string.dashboard_not_configured)
        }
        Text(
            text = configuredText,
            style = MaterialTheme.typography.bodyLarge
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onConfigure) {
                Text(text = stringResource(id = R.string.dashboard_configure_button))
            }
            OutlinedButton(onClick = onTest, enabled = uiState.config.isConfigured && !uiState.isTesting) {
                Text(
                    text = if (uiState.isTesting) {
                        stringResource(id = R.string.dashboard_testing)
                    } else {
                        stringResource(id = R.string.dashboard_test_button)
                    }
                )
            }
        }
    }
}

@Composable
private fun ConnectionConfigDialog(
    uiState: DashboardUiState,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onBaseUrlChanged: (String) -> Unit,
    onTokenChanged: (String) -> Unit,
    onModeChanged: (ConnectionMode) -> Unit,
    onRelayBaseUrlChanged: (String) -> Unit,
    onRelayTokenChanged: (String) -> Unit,
    onRelayMirrorIdChanged: (String) -> Unit,
    onLogin: () -> Unit,
    onPickMirror: () -> Unit,
    onVerifyToken: () -> Unit,
    onLogout: () -> Unit
) {
    var isTokenVisible by remember { mutableStateOf(false) }
    var isRelayTokenVisible by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(onClick = onSave) {
                Text(text = stringResource(id = R.string.dashboard_save_config))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = stringResource(id = R.string.dashboard_cancel_config))
            }
        },
        title = { Text(text = stringResource(id = R.string.dashboard_config_dialog_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Mensagens inline (quando diálogo está aberto, evitamos Snackbar por cima)
                if (!uiState.message.isNullOrBlank()) {
                    Text(text = uiState.message!!, color = MaterialTheme.colorScheme.error)
                }
                // Mode selector
                Text(text = stringResource(id = R.string.dashboard_mode_label), style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ModeChip(
                        text = stringResource(id = R.string.dashboard_mode_lan),
                        selected = uiState.draftMode == ConnectionMode.LAN,
                        onClick = { onModeChanged(ConnectionMode.LAN) }
                    )
                    ModeChip(
                        text = stringResource(id = R.string.dashboard_mode_relay),
                        selected = uiState.draftMode == ConnectionMode.RELAY,
                        onClick = { onModeChanged(ConnectionMode.RELAY) }
                    )
                }

                if (uiState.draftMode == ConnectionMode.LAN) {
                    OutlinedTextField(
                        value = uiState.draftBaseUrl,
                        onValueChange = onBaseUrlChanged,
                        label = { Text(stringResource(id = R.string.dashboard_config_url_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = uiState.draftToken,
                        onValueChange = onTokenChanged,
                        label = { Text(stringResource(id = R.string.dashboard_config_token_label)) },
                        singleLine = true,
                        visualTransformation = if (isTokenVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { isTokenVisible = !isTokenVisible }) {
                                Icon(
                                    imageVector = if (isTokenVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = null
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Text(
                        text = stringResource(id = R.string.dashboard_config_token_hint),
                        style = MaterialTheme.typography.bodySmall
                    )
                } else {
                    OutlinedTextField(
                        value = uiState.draftRelayBaseUrl,
                        onValueChange = onRelayBaseUrlChanged,
                        label = { Text(stringResource(id = R.string.dashboard_relay_url_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (!uiState.relayEmail.isNullOrBlank()) {
                        Text(text = "Autenticado como: ${uiState.relayEmail}", style = MaterialTheme.typography.bodySmall)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        TextButton(onClick = onLogin) { Text(text = stringResource(id = R.string.dashboard_relay_login_button)) }
                        TextButton(onClick = onVerifyToken) { Text(text = "Verificar token") }
                        TextButton(onClick = onPickMirror) { Text(text = stringResource(id = R.string.dashboard_relay_pick_mirror_button)) }
                        TextButton(onClick = onLogout) { Text(text = "Sair") }
                    }
                    OutlinedTextField(
                        value = uiState.draftRelayToken,
                        onValueChange = onRelayTokenChanged,
                        label = { Text(stringResource(id = R.string.dashboard_relay_token_label)) },
                        singleLine = true,
                        visualTransformation = if (isRelayTokenVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { isRelayTokenVisible = !isRelayTokenVisible }) {
                                Icon(
                                    imageVector = if (isRelayTokenVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = null
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (uiState.draftRelayToken.isNotBlank()) {
                        val t = uiState.draftRelayToken
                        val preview = if (t.length > 14) t.take(8) + "…" + t.takeLast(6) else t
                        Text(text = "Token atual: $preview", style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedTextField(
                        value = uiState.draftRelayMirrorId,
                        onValueChange = onRelayMirrorIdChanged,
                        label = { Text(stringResource(id = R.string.dashboard_relay_mirror_id_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = stringResource(id = R.string.dashboard_relay_hint),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        text = stringResource(id = R.string.dashboard_relay_hint_emulator),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    )
}

@Composable
private fun RelayLoginDialog(
    email: String,
    password: String,
    onEmailChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    onRegister: () -> Unit
) {
    var isPasswordVisible by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = onRegister) { Text(text = stringResource(id = R.string.relay_login_register)) }
                Button(onClick = onConfirm) { Text(text = stringResource(id = R.string.relay_login_confirm)) }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(text = stringResource(id = R.string.relay_login_cancel)) }
        },
        title = { Text(text = stringResource(id = R.string.relay_login_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = onEmailChanged,
                    label = { Text(stringResource(id = R.string.relay_login_email)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = onPasswordChanged,
                    label = { Text(stringResource(id = R.string.relay_login_password)) },
                    singleLine = true,
                    visualTransformation = if (isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { isPasswordVisible = !isPasswordVisible }) {
                            Icon(
                                imageVector = if (isPasswordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = null
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    )
}

@Composable
private fun MirrorPickerDialog(
    mirrors: List<com.dumbmirror.remote.domain.model.RelayMirror>,
    accountEmail: String?,
    onDismiss: () -> Unit,
    onSelect: (id: String, name: String) -> Unit,
    onSelectById: (id: String) -> Unit,
    isCreateExpanded: Boolean,
    onToggleCreate: (Boolean) -> Unit,
    onCreateMirror: (name: String) -> Unit = {},
    message: String? = null,
    isCreating: Boolean = false
) {
    var newMirrorName by remember { mutableStateOf("") }
    var manualId by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(text = stringResource(id = R.string.relay_picker_close)) }
        },
        title = { Text(text = stringResource(id = R.string.relay_picker_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!message.isNullOrBlank()) {
                    Text(text = message, color = MaterialTheme.colorScheme.error)
                }
                if (!accountEmail.isNullOrBlank()) {
                    Text(text = "Conta atual: ${accountEmail}", style = MaterialTheme.typography.bodySmall)
                }
                mirrors.forEach { m ->
                    OutlinedButton(onClick = { onSelect(m.id, m.name) }, modifier = Modifier.fillMaxWidth()) {
                        Text(text = "${'$'}{m.name} (${ '$'}{m.id.take(8)}…)")
                    }
                }
                if (mirrors.isEmpty()) {
                    Text(text = stringResource(id = R.string.relay_picker_empty))
                }
                // Selecionar por ID manual (ajuda quando você vê o ID no espelho mas não lembra a conta)
                OutlinedTextField(
                    value = manualId,
                    onValueChange = { manualId = it },
                    label = { Text("ID do espelho (manual)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { onSelectById(manualId) }, enabled = manualId.isNotBlank()) {
                        Text(text = "Selecionar por ID")
                    }
                }
                // Criar novo espelho (colocado atrás de um toggle)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TextButton(onClick = { onToggleCreate(!isCreateExpanded) }) {
                        Text(text = if (isCreateExpanded) "Ocultar 'Adicionar novo espelho'" else "Adicionar novo espelho")
                    }
                }
                if (isCreateExpanded) {
                    OutlinedTextField(
                        value = newMirrorName,
                        onValueChange = { newMirrorName = it },
                        label = { Text(stringResource(id = R.string.relay_create_mirror_name)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = { onCreateMirror(newMirrorName) }, enabled = !isCreating) {
                            Text(text = stringResource(id = R.string.relay_create_mirror_button))
                        }
                    }
                }
            }
        }
    )
}

@Composable
private fun ModeChip(text: String, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val bg = if (selected) colors.primary.copy(alpha = 0.12f) else colors.surfaceVariant
    val content = if (selected) colors.primary else colors.onSurfaceVariant
    Text(
        text = text,
        color = content,
        modifier = Modifier
            .selectable(selected = selected, onClick = onClick, role = Role.Button)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    )
}

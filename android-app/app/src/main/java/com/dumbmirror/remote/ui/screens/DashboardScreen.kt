package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dumbmirror.remote.R
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.RelayDefaults

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfigurationScreen(
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
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
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
            onRelayTokenChanged = viewModel::updateDraftRelayToken,
            onRelayMirrorIdChanged = viewModel::updateDraftRelayMirrorId,
            onLogin = viewModel::openLoginDialog,
            onPickMirror = viewModel::openMirrorPicker,
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
    val isConfigured = uiState.config.isConfigured
    val isRelay = uiState.config.mode == ConnectionMode.RELAY
    val hasMirror = uiState.hasRelayMirror || !uiState.config.relay.mirrorId.isNullOrBlank()
    val isReady = when {
        !isConfigured -> false
        isRelay && !uiState.isRelayAuthenticated -> false
        isRelay && !hasMirror -> false
        else -> true
    }

    val statusIcon = when {
        isReady -> Icons.Filled.CheckCircle
        isConfigured -> Icons.Filled.Warning
        else -> Icons.Filled.ErrorOutline
    }
    val statusColor = when {
        isReady -> MaterialTheme.colorScheme.primary
        isConfigured -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.error
    }
    val statusLabel = when {
        isReady -> stringResource(id = R.string.dashboard_status_ready)
        isConfigured -> stringResource(id = R.string.dashboard_status_attention)
        else -> stringResource(id = R.string.dashboard_status_missing)
    }

    val configuredText = when {
        !isConfigured -> stringResource(id = R.string.dashboard_not_configured)
        isRelay && !uiState.isRelayAuthenticated -> stringResource(id = R.string.dashboard_status_relay_login_missing)
        isRelay && !hasMirror -> stringResource(id = R.string.dashboard_status_relay_mirror_missing)
        else -> null
    }

    val endpointLabel = if (isRelay) {
        stringResource(id = R.string.dashboard_relay_url_label)
    } else {
        stringResource(id = R.string.dashboard_config_url_label)
    }
    val endpointValue = if (isRelay) uiState.config.relay.baseUrl else uiState.config.baseUrl
    val accountValue = uiState.relayEmail?.takeIf { it.isNotBlank() }
    val mirrorDisplay = uiState.relayMirrorName
        ?: uiState.config.relay.mirrorName
        ?: uiState.config.relay.mirrorId
    val mirrorIdValue = uiState.config.relay.mirrorId

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = stringResource(id = R.string.dashboard_session_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = stringResource(id = R.string.dashboard_session_subtitle),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                Surface(
                    shape = CircleShape,
                    color = statusColor.copy(alpha = 0.12f)
                ) {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = statusIcon,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = statusLabel,
                            style = MaterialTheme.typography.labelMedium,
                            color = statusColor
                        )
                    }
                }
            }

            if (configuredText != null) {
                Text(
                    text = configuredText,
                    style = MaterialTheme.typography.bodyLarge
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    InfoTile(
                        label = stringResource(id = R.string.dashboard_status_mode_label),
                        value = if (isRelay) {
                            stringResource(id = R.string.dashboard_mode_relay)
                        } else {
                            stringResource(id = R.string.dashboard_mode_lan)
                        },
                        modifier = Modifier.weight(1f)
                    )
                    InfoTile(
                        label = endpointLabel,
                        value = endpointValue.ifBlank { stringResource(id = R.string.dashboard_status_not_available) },
                        modifier = Modifier.weight(1f)
                    )
                }

                if (isRelay) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        InfoTile(
                            label = stringResource(id = R.string.dashboard_status_account_label),
                            value = accountValue ?: stringResource(id = R.string.dashboard_status_not_available),
                            modifier = Modifier.weight(1f)
                        )
                        InfoTile(
                            label = stringResource(id = R.string.dashboard_status_mirror_label),
                            value = mirrorDisplay?.let { shortenMiddle(it) }
                                ?: stringResource(id = R.string.dashboard_status_not_available),
                            modifier = Modifier.weight(1f)
                        )
                    }

                    InfoTile(
                        label = stringResource(id = R.string.dashboard_relay_mirror_id_label),
                        value = mirrorIdValue?.let { shortenMiddle(it, maxChars = 32) }
                            ?: stringResource(id = R.string.dashboard_status_not_available)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = onConfigure
                ) {
                    Text(text = stringResource(id = R.string.dashboard_configure_button))
                }
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = onTest,
                    enabled = uiState.config.isConfigured && !uiState.isTesting
                ) {
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
}

@Composable
private fun InfoTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 1.dp,
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold
    )
}

@Composable
private fun MessageBanner(message: String) {
    val lowered = message.lowercase()
    val isNegative = listOf("erro", "falha", "inválido", "não", "sem").any { lowered.contains(it) }
    val container = if (isNegative) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.tertiaryContainer
    val onContainer = if (isNegative) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onTertiaryContainer
    Surface(
        color = container,
        shape = RoundedCornerShape(16.dp)
    ) {
        Text(
            text = message,
            color = onContainer,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp)
        )
    }
}

private fun shortenMiddle(value: String, maxChars: Int = 24): String {
    if (value.length <= maxChars) return value
    if (maxChars < 4) return value
    val half = (maxChars - 1) / 2
    return value.take(half) + "…" + value.takeLast(half)
}

@Composable
private fun ConnectionConfigDialog(
    uiState: DashboardUiState,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onBaseUrlChanged: (String) -> Unit,
    onTokenChanged: (String) -> Unit,
    onModeChanged: (ConnectionMode) -> Unit,
    onRelayTokenChanged: (String) -> Unit,
    onRelayMirrorIdChanged: (String) -> Unit,
    onLogin: () -> Unit,
    onPickMirror: () -> Unit,
    onLogout: () -> Unit
) {
    var isTokenVisible by remember { mutableStateOf(false) }
    var isRelayTokenVisible by remember { mutableStateOf(false) }
    val scrollState = rememberScrollState()

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
            Column(
                modifier = Modifier
                    .heightIn(max = 520.dp)
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (!uiState.message.isNullOrBlank()) {
                    MessageBanner(uiState.message!!)
                }
                // Mode selector
                SectionHeader(text = stringResource(id = R.string.dashboard_mode_label))
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
                    SectionHeader(text = stringResource(id = R.string.dashboard_relay_session_section))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                            InfoTile(
                                label = stringResource(id = R.string.dashboard_status_account_label),
                                value = uiState.relayEmail?.takeIf { it.isNotBlank() }
                                    ?: stringResource(id = R.string.dashboard_status_not_available),
                                modifier = Modifier.weight(1f)
                            )
                            val resolvedMirrorName = uiState.relayMirrorName ?: uiState.config.relay.mirrorName
                            InfoTile(
                                label = stringResource(id = R.string.dashboard_status_mirror_label),
                                value = resolvedMirrorName?.takeIf { it.isNotBlank() }
                                    ?: stringResource(id = R.string.dashboard_status_not_available),
                                modifier = Modifier.weight(1f)
                            )
                        }
                        InfoTile(
                            label = stringResource(id = R.string.dashboard_relay_mirror_id_label),
                            value = uiState.draftRelayMirrorId.ifBlank {
                                uiState.config.relay.mirrorId.orEmpty()
                            }.ifBlank { stringResource(id = R.string.dashboard_status_not_available) }
                        )
                        InfoTile(
                            label = stringResource(id = R.string.dashboard_relay_url_label),
                            value = uiState.draftRelayBaseUrl.ifBlank { RelayDefaults.DEFAULT_BASE_URL }
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        TextButton(onClick = onLogin, enabled = !uiState.isRelayAuthenticated) {
                            Text(text = stringResource(id = R.string.dashboard_relay_login_button))
                        }
                        TextButton(onClick = onLogout, enabled = uiState.isRelayAuthenticated) {
                            Text(text = stringResource(id = R.string.dashboard_relay_logout_button))
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        TextButton(onClick = onPickMirror, enabled = uiState.isRelayAuthenticated) {
                            Text(text = stringResource(id = R.string.dashboard_relay_pick_mirror_button))
                        }
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
                    val previewId = if (m.id.length > 8) "${m.id.take(8)}…" else m.id
                    OutlinedButton(onClick = { onSelect(m.id, m.name) }, modifier = Modifier.fillMaxWidth()) {
                        Text(text = "${m.name} ($previewId)")
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

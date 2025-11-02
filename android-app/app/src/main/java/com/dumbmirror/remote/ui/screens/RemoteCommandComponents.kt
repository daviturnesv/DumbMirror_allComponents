package com.dumbmirror.remote.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

enum class RemoteCommandStyle { FILLED, OUTLINED }

data class RemoteCommand(
    val label: String,
    val notification: String,
    val payload: Map<String, Any?> = emptyMap(),
    val successMessage: String? = null,
    val style: RemoteCommandStyle = RemoteCommandStyle.FILLED
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RemoteCommandSection(
    title: String,
    commands: List<RemoteCommand>,
    enabled: Boolean,
    onCommandClick: (RemoteCommand) -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(text = title, style = MaterialTheme.typography.titleMedium)
        if (!description.isNullOrBlank()) {
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            commands.forEach { command ->
                when (command.style) {
                    RemoteCommandStyle.FILLED -> {
                        Button(
                            onClick = { onCommandClick(command) },
                            enabled = enabled
                        ) {
                            Text(
                                text = command.label,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                    RemoteCommandStyle.OUTLINED -> {
                        OutlinedButton(
                            onClick = { onCommandClick(command) },
                            enabled = enabled
                        ) {
                            Text(
                                text = command.label,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        }
    }
}

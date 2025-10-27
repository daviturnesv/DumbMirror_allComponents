package com.dumbmirror.remote.data.remote

import kotlinx.coroutines.flow.Flow

interface RemoteGateway {
    suspend fun sendCommand(command: String, payload: Map<String, Any?> = emptyMap()): Result<Unit>
    suspend fun testConnection(): Result<Unit>
    fun observeEvents(): Flow<RemoteEvent>
}

data class RemoteEvent(
    val type: String,
    val data: Map<String, Any?>
)

package com.dumbmirror.remote.domain.usecase

import com.dumbmirror.remote.data.remote.RemoteGateway

class SendCommandUseCase(private val gateway: RemoteGateway) {
    suspend operator fun invoke(command: String, payload: Map<String, Any?> = emptyMap()): Result<Unit> {
        return gateway.sendCommand(command, payload)
    }
}

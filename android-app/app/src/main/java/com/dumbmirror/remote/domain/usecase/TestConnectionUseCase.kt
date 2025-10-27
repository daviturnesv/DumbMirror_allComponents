package com.dumbmirror.remote.domain.usecase

import com.dumbmirror.remote.data.remote.RemoteGatewayFactory
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode

class TestConnectionUseCase(
    private val gatewayFactory: RemoteGatewayFactory
) {
    suspend operator fun invoke(config: ConnectionConfig): Result<Unit> {
        if (!config.isConfigured) {
            return Result.failure(IllegalStateException("Configuração incompleta"))
        }
        val gateway = gatewayFactory.create(config)
        return gateway.testConnection()
    }
}

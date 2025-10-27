package com.dumbmirror.remote.domain.usecase

import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.domain.model.ConnectionConfig

class SaveConnectionConfigUseCase(
    private val repository: ConnectionRepository
) {
    suspend operator fun invoke(config: ConnectionConfig) {
        repository.saveConfig(config)
    }
}

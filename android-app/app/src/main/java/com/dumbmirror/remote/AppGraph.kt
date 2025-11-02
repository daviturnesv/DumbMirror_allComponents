package com.dumbmirror.remote

import android.content.Context
import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.data.local.RelayAccountRepository
import com.dumbmirror.remote.data.remote.RemoteGatewayFactory
import com.dumbmirror.remote.data.remote.RelayRemoteDataSource
import com.dumbmirror.remote.domain.model.RelayDefaults
import kotlinx.serialization.json.Json
import com.dumbmirror.remote.domain.usecase.SaveConnectionConfigUseCase
import com.dumbmirror.remote.domain.usecase.TestConnectionUseCase

object AppGraph {
    lateinit var connectionRepository: ConnectionRepository
        private set

    lateinit var remoteGatewayFactory: RemoteGatewayFactory
        private set

    private val json: Json by lazy { Json { ignoreUnknownKeys = true } }
    lateinit var relayAccountRepository: RelayAccountRepository
        private set

    fun initialize(context: Context) {
        val appContext = context.applicationContext
        connectionRepository = ConnectionRepository(appContext)
        remoteGatewayFactory = RemoteGatewayFactory(json)
        relayAccountRepository = RelayAccountRepository(appContext)
    }

    fun provideSaveConnectionUseCase(): SaveConnectionConfigUseCase {
        return SaveConnectionConfigUseCase(connectionRepository)
    }

    fun provideTestConnectionUseCase(): TestConnectionUseCase {
        return TestConnectionUseCase(remoteGatewayFactory)
    }

    fun provideRelayRemoteDataSource(baseUrl: String): RelayRemoteDataSource {
        val effectiveBase = baseUrl.ifBlank { RelayDefaults.DEFAULT_BASE_URL }
        val normalized = RelayDefaults.normalizeBaseUrl(effectiveBase)
        return RelayRemoteDataSource(baseUrl = normalized, json = json)
    }
}

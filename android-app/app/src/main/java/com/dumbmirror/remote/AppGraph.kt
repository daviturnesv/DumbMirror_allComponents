package com.dumbmirror.remote

import android.content.Context
import com.dumbmirror.remote.data.auth.RelayAuthRepository
import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.data.local.RelayAccountRepository
import com.dumbmirror.remote.data.remote.RemoteGatewayFactory
import com.dumbmirror.remote.data.remote.RelayClient
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
    lateinit var relayAuthRepository: RelayAuthRepository
        private set

    lateinit var relayClient: RelayClient
        private set

    fun initialize(context: Context) {
        val appContext = context.applicationContext
        connectionRepository = ConnectionRepository(appContext)
        relayClient = RelayClient()
        remoteGatewayFactory = RemoteGatewayFactory(relayClient, json)
        val relayAccountRepository = RelayAccountRepository(appContext)
        relayAuthRepository = RelayAuthRepository(
            connectionRepository = connectionRepository,
            relayAccountRepository = relayAccountRepository,
            json = json
        )
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

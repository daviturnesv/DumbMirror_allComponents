package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import kotlinx.serialization.json.Json

class RemoteGatewayFactory(
    private val json: Json = Json { ignoreUnknownKeys = true }
) {
    fun create(config: ConnectionConfig): RemoteGateway {
        return when (config.mode) {
            ConnectionMode.LAN -> LanRemoteGateway(config, json)
            ConnectionMode.RELAY -> RelayRemoteGateway(config.relay, json)
        }
    }
}

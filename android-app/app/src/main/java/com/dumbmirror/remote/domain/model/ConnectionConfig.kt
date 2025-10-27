package com.dumbmirror.remote.domain.model

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import com.dumbmirror.remote.util.PlatformInfo

enum class ConnectionMode {
    LAN,
    RELAY
}

data class RelayDetails(
    val baseUrl: String = "",
    val accessToken: String? = null,
    val mirrorId: String? = null,
    val mirrorName: String? = null
) {
    val isConfigured: Boolean
        get() = baseUrl.isNotBlank() && !accessToken.isNullOrBlank() && !mirrorId.isNullOrBlank()

    fun normalizedBaseUrl(): String = normalizeUrl(baseUrl)
}

data class ConnectionConfig(
    val mode: ConnectionMode = ConnectionMode.LAN,
    val baseUrl: String = "",
    val token: String? = null,
    val relay: RelayDetails = RelayDetails()
) {
    val isConfigured: Boolean
        get() = when (mode) {
            ConnectionMode.LAN -> baseUrl.isNotBlank()
            ConnectionMode.RELAY -> relay.isConfigured
        }

    fun normalizedBaseUrl(): String = normalizeUrl(baseUrl)

    companion object {
        fun fromParts(host: String, token: String?): ConnectionConfig {
            val normalized = normalizeUrl(host)
            val sanitizedToken = token?.takeIf { it.isNotBlank() }
            return ConnectionConfig(
                mode = ConnectionMode.LAN,
                baseUrl = normalized,
                token = sanitizedToken
            )
        }

        fun fromRelay(baseUrl: String, accessToken: String?, mirrorId: String?, mirrorName: String? = null): ConnectionConfig {
            val relayDetails = RelayDetails(
                baseUrl = normalizeUrl(baseUrl),
                accessToken = accessToken?.takeIf { it.isNotBlank() },
                mirrorId = mirrorId?.takeIf { it.isNotBlank() },
                mirrorName = mirrorName?.takeIf { it.isNotBlank() }
            )
            return ConnectionConfig(
                mode = ConnectionMode.RELAY,
                relay = relayDetails
            )
        }
    }
}

private fun normalizeUrl(rawHost: String): String {
    val trimmed = rawHost.trim()
    if (trimmed.isEmpty()) return ""
    val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        trimmed
    } else {
        "http://$trimmed"
    }

    // Se estiver emulador e o host for localhost/127.0.0.1, redireciona para 10.0.2.2
    val adjusted = withScheme.toHttpUrlOrNull()?.let { url ->
        val host = url.host
        if (PlatformInfo.isEmulator && (host == "localhost" || host == "127.0.0.1")) {
            url.newBuilder().host("10.0.2.2").build().toString()
        } else withScheme
    } ?: withScheme

    val httpUrl = adjusted.toHttpUrlOrNull()
    val base = httpUrl?.newBuilder()?.encodedPath("/")?.build()?.toString() ?: withScheme
    return if (base.endsWith('/')) base else "$base/"
}

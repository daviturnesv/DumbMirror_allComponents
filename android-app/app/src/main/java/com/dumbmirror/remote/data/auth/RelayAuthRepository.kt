package com.dumbmirror.remote.data.auth

import com.dumbmirror.remote.data.local.ConnectionRepository
import com.dumbmirror.remote.data.local.RelayAccountRepository
import com.dumbmirror.remote.data.remote.RelayRemoteDataSource
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.RelayAccount
import com.dumbmirror.remote.domain.model.RelayDefaults
import com.dumbmirror.remote.domain.model.RelayMirror
import com.dumbmirror.remote.domain.model.RelayMirrorWithSecret
import com.dumbmirror.remote.domain.model.RelaySession
import com.dumbmirror.remote.domain.model.RelayUser
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

class RelayAuthRepository(
    private val connectionRepository: ConnectionRepository,
    private val relayAccountRepository: RelayAccountRepository,
    private val json: Json
) {

    private val lock = Mutex()

    val accountFlow: Flow<RelayAccount> = relayAccountRepository.observeAccount()

    val sessionFlow: Flow<RelaySessionSnapshot> = combine(
        relayAccountRepository.observeAccount(),
        connectionRepository.observeConfig()
    ) { account, connection ->
        RelaySessionSnapshot(
            account = account,
            connection = connection,
            isAuthenticated = account.isAuthenticated,
            hasMirrorSelected = account.hasMirrorSelected
        )
    }.distinctUntilChanged()

    suspend fun login(baseUrl: String, email: String, password: String): Result<RelaySession> {
        val normalizedBase = normalizeBaseOrNull(baseUrl)
            ?: return Result.failure(IllegalArgumentException("Endereço do Relay inválido."))
        val dataSource = RelayRemoteDataSource(normalizedBase, json)
        val result = dataSource.login(email, password)
        result.onSuccess { session ->
            persistAccount(
                RelayAccount(
                    baseUrl = normalizedBase,
                    email = session.user.email,
                    accessToken = session.token,
                    mirrorId = null,
                    mirrorName = null
                )
            )
        }
        return result
    }

    suspend fun register(baseUrl: String, email: String, password: String): Result<RelaySession> {
        val normalizedBase = normalizeBaseOrNull(baseUrl)
            ?: return Result.failure(IllegalArgumentException("Endereço do Relay inválido."))
        val dataSource = RelayRemoteDataSource(normalizedBase, json)
        val result = dataSource.register(email, password)
        result.onSuccess { session ->
            persistAccount(
                RelayAccount(
                    baseUrl = normalizedBase,
                    email = session.user.email,
                    accessToken = session.token,
                    mirrorId = null,
                    mirrorName = null
                )
            )
        }
        return result
    }

    suspend fun verifyToken(baseUrl: String, token: String): Result<RelayUser> {
        val normalizedBase = normalizeBaseOrNull(baseUrl)
            ?: return Result.failure(IllegalArgumentException("Endereço do Relay inválido."))
        val dataSource = RelayRemoteDataSource(normalizedBase, json)
        return dataSource.whoAmI(token)
    }

    suspend fun listMirrors(baseUrl: String, token: String): Result<List<RelayMirror>> {
        val normalizedBase = normalizeBaseOrNull(baseUrl)
            ?: return Result.failure(IllegalArgumentException("Endereço do Relay inválido."))
        val dataSource = RelayRemoteDataSource(normalizedBase, json)
        return dataSource.listMirrors(token)
    }

    suspend fun createMirror(baseUrl: String, token: String, name: String): Result<RelayMirrorWithSecret> {
        val normalizedBase = normalizeBaseOrNull(baseUrl)
            ?: return Result.failure(IllegalArgumentException("Endereço do Relay inválido."))
        val dataSource = RelayRemoteDataSource(normalizedBase, json)
        return dataSource.createMirror(token, name)
    }

    suspend fun getMirrorStatus(baseUrl: String, token: String, mirrorId: String): Result<RelayMirror> {
        val normalizedBase = normalizeBaseOrNull(baseUrl)
            ?: return Result.failure(IllegalArgumentException("Endereço do Relay inválido."))
        val dataSource = RelayRemoteDataSource(normalizedBase, json)
        return dataSource.getMirrorStatus(token, mirrorId)
    }

    suspend fun saveMirrorSelection(mirrorId: String, mirrorName: String?) {
        lock.withLock {
            val current = relayAccountRepository.observeAccount().first()
            val normalizedBase = normalizeBaseOrNull(current.baseUrl)
                ?: RelayDefaults.DEFAULT_BASE_URL
            val updated = current.copy(
                baseUrl = normalizedBase,
                mirrorId = mirrorId,
                mirrorName = mirrorName?.takeIf { it.isNotBlank() }
            )
            relayAccountRepository.saveAccount(updated)
            connectionRepository.saveConfig(
                ConnectionConfig.fromRelay(
                    normalizedBase,
                    updated.accessToken,
                    updated.mirrorId,
                    updated.mirrorName
                )
            )
        }
    }

    suspend fun logout(): ConnectionConfig = lock.withLock {
        val current = relayAccountRepository.observeAccount().first()
        relayAccountRepository.clearAccount()
        val normalizedBase = normalizeBaseOrNull(current.baseUrl)
            ?: RelayDefaults.DEFAULT_BASE_URL
        val cleared = ConnectionConfig.fromRelay(normalizedBase, null, null)
        connectionRepository.saveConfig(cleared)
        cleared
    }

    private suspend fun persistAccount(account: RelayAccount) {
        lock.withLock {
            val normalizedBase = normalizeBaseOrNull(account.baseUrl)
                ?: RelayDefaults.DEFAULT_BASE_URL
            val sanitized = account.copy(
                baseUrl = normalizedBase,
                email = account.email.trim(),
                accessToken = account.accessToken?.takeIf { it.isNotBlank() },
                mirrorId = account.mirrorId?.takeIf { it.isNotBlank() },
                mirrorName = account.mirrorName?.takeIf { it.isNotBlank() }
            )
            relayAccountRepository.saveAccount(sanitized)
            connectionRepository.saveConfig(
                ConnectionConfig.fromRelay(
                    normalizedBase,
                    sanitized.accessToken,
                    sanitized.mirrorId,
                    sanitized.mirrorName
                )
            )
        }
    }

    private fun normalizeBaseOrNull(raw: String): String? {
        val candidate = raw.ifBlank { RelayDefaults.DEFAULT_BASE_URL }
        val normalized = RelayDefaults.normalizeBaseUrl(candidate)
        return normalized.takeIf { it.isNotBlank() }
    }
}

data class RelaySessionSnapshot(
    val account: RelayAccount,
    val connection: ConnectionConfig,
    val isAuthenticated: Boolean,
    val hasMirrorSelected: Boolean
) {
    val mode: ConnectionMode = connection.mode
}

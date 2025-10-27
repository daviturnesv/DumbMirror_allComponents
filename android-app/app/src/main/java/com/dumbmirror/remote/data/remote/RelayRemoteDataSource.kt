package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.RelayAccount
import com.dumbmirror.remote.domain.model.RelayMirror
import com.dumbmirror.remote.domain.model.RelayMirrorWithSecret
import com.dumbmirror.remote.domain.model.RelaySession
import com.dumbmirror.remote.domain.model.RelayUser
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Retrofit
import retrofit2.Response
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory

class RelayRemoteDataSource(
    private val baseUrl: String,
    private val json: Json,
    client: OkHttpClient? = null
) {

    private val httpClient = client ?: OkHttpClient.Builder().build()

    private val service: RelayApiService by lazy {
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .client(httpClient)
            .build()
            .create(RelayApiService::class.java)
    }

    suspend fun register(email: String, password: String): Result<RelaySession> = runCatching {
        val response = service.register(RegisterRequest(email, password))
        ensureSuccess(response)
        response.body()?.toSession(baseUrl) ?: error("Resposta inválida")
    }

    suspend fun login(email: String, password: String): Result<RelaySession> = runCatching {
        val response = service.login(LoginRequest(email, password))
        ensureSuccess(response)
        response.body()?.toSession(baseUrl) ?: error("Resposta inválida")
    }

    suspend fun whoAmI(token: String): Result<RelayUser> = runCatching {
        val response = service.whoAmI("Bearer $token")
        ensureSuccess(response)
        val body = response.body() ?: error("Resposta inválida")
        RelayUser(id = body.user.id, email = body.user.email)
    }

    suspend fun listMirrors(token: String): Result<List<RelayMirror>> = runCatching {
        val response = service.listMirrors("Bearer $token")
        ensureSuccess(response)
        response.body()?.mirrors?.map { it.toDomain() } ?: emptyList()
    }

    suspend fun createMirror(token: String, name: String): Result<RelayMirrorWithSecret> = runCatching {
        val response = service.createMirror("Bearer $token", CreateMirrorRequest(name))
        ensureSuccess(response)
        response.body()?.mirror?.toDomain() ?: error("Resposta inválida")
    }

    suspend fun getMirrorStatus(token: String, mirrorId: String): Result<RelayMirror> = runCatching {
        val response = service.getMirrorStatus("Bearer $token", mirrorId)
        ensureSuccess(response)
        val body = response.body() ?: error("Resposta inválida")
        body.mirror.toDomain()
    }

    fun buildGateway(account: RelayAccount, json: Json): RelayRemoteGateway {
        return RelayRemoteGateway(
            details = account.toRelayDetails(),
            json = json
        )
    }

    private fun ensureSuccess(response: Response<*>) {
        if (!response.isSuccessful) {
            val code = response.code()
            val message = response.errorBody()?.string()?.take(200)
            throw IllegalStateException("Erro $code: ${message ?: response.message()}")
        }
    }
}

private fun AuthResponse.toSession(baseUrl: String): RelaySession {
    val user = RelayUser(id = user.id, email = user.email)
    return RelaySession(user = user, token = token, baseUrl = baseUrl)
}

private fun RelayMirrorDto.toDomain(): RelayMirror {
    return RelayMirror(
        id = id,
        name = name,
        createdAt = createdAt,
        online = online
    )
}

private fun RelayMirrorSecretDto.toDomain(): RelayMirrorWithSecret {
    return RelayMirrorWithSecret(
        mirror = RelayMirror(
            id = id,
            name = name,
            createdAt = createdAt,
            online = false
        ),
        secret = secret
    )
}

private fun RelayMirrorStatusDto.toDomain(): RelayMirror {
    return RelayMirror(
        id = id,
        name = name,
        createdAt = null,
        online = online
    )
}

private fun RelayAccount.toRelayDetails() = com.dumbmirror.remote.domain.model.RelayDetails(
    baseUrl = baseUrl,
    accessToken = accessToken,
    mirrorId = mirrorId,
    mirrorName = mirrorName
)

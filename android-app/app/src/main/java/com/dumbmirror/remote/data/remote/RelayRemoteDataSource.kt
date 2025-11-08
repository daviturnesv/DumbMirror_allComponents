package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.RelayAccount
import com.dumbmirror.remote.domain.model.RelayMirror
import com.dumbmirror.remote.domain.model.RelayMirrorWithSecret
import com.dumbmirror.remote.domain.model.RelaySession
import com.dumbmirror.remote.domain.model.RelayUser
import com.dumbmirror.remote.domain.model.SensorReading
import com.dumbmirror.remote.domain.model.SensorReport
import com.dumbmirror.remote.domain.model.SensorSummary
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.Response
import retrofit2.Retrofit

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

    suspend fun getSensorLatest(token: String, mirrorId: String): Result<SensorReading?> = runCatching {
        val response = service.getSensorLatest("Bearer $token", mirrorId)
        if (response.isNotFound()) return@runCatching null
        ensureSuccess(response)
        response.body()?.sensor?.toDomain(json) ?: error("Resposta inválida")
    }

    suspend fun getSensorSummary(token: String, mirrorId: String): Result<SensorSummary?> = runCatching {
        val response = service.getSensorSummary("Bearer $token", mirrorId)
        if (response.isNotFound()) return@runCatching null
        ensureSuccess(response)
    response.body()?.summary?.toSummary()
    }

    suspend fun getSensorReport(token: String, mirrorId: String): Result<SensorReport?> = runCatching {
        val response = service.getSensorReport("Bearer $token", mirrorId)
        if (response.isNotFound()) return@runCatching null
        ensureSuccess(response)
    response.body()?.report?.toReport()
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

private fun Response<*>.isNotFound(): Boolean = code() == 404

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

private fun SensorReadingDto.toDomain(json: Json): SensorReading {
    val (motionFlag, motionRaw) = parseMotion(motion, json)
    return SensorReading(
        timestampMs = ts,
        temperatureC = temperature,
        humidityPercent = humidity,
        lightLux = light,
        motionFlag = motionFlag,
        motionRaw = motionRaw,
        forwardedAt = forwardedAt,
        receivedAt = receivedAt,
        sender = sender
    )
}

private fun SensorEnvelopeDto.toSummary(): SensorSummary {
    return SensorSummary(
        data = data,
        forwardedAt = forwardedAt,
        receivedAt = receivedAt,
        sender = sender
    )
}

private fun SensorEnvelopeDto.toReport(): SensorReport {
    return SensorReport(
        data = data,
        forwardedAt = forwardedAt,
        receivedAt = receivedAt,
        sender = sender
    )
}

private fun parseMotion(element: JsonElement?, json: Json): Pair<Boolean?, String?> {
    if (element == null || element is JsonNull) {
        return null to null
    }
    if (element is JsonPrimitive) {
        element.booleanOrNull?.let { return it to it.toString() }
        element.intOrNull?.let { return (it != 0) to it.toString() }
        element.longOrNull?.let { return (it != 0L) to it.toString() }
        element.doubleOrNull?.let { return (it != 0.0) to element.content }
        element.contentOrNull?.let { return null to it }
    }
    val raw = json.encodeToString(JsonElement.serializer(), element)
    return null to raw
}

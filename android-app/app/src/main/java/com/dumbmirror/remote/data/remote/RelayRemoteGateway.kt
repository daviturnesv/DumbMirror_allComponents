package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.RelayDetails
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

private const val DEFAULT_TIMEOUT_SECONDS = 15L

class RelayRemoteGateway(
    private val details: RelayDetails,
    private val json: Json,
    private val relayClient: RelayClient
) : RemoteGateway {

    private val mirrorId: String
        get() = details.mirrorId ?: throw IllegalStateException("Mirror ID não configurado.")

    private val accessToken: String
        get() = details.accessToken ?: throw IllegalStateException("Token de acesso ausente.")

    private val baseUrl: String
        get() = details.normalizedBaseUrl()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()

    override suspend fun sendCommand(command: String, payload: Map<String, Any?>): Result<Unit> {
        return runCatching {
            val requestJson = JsonObject(buildMap {
                put("notification", JsonPrimitive(command))
                if (payload.isNotEmpty()) {
                    put("payload", payload.toJsonElement())
                }
            })
            val url = baseUrl + "api/mirrors/$mirrorId/commands"
            executePost(url, requestJson)
        }
    }

    override suspend fun testConnection(): Result<Unit> {
        return runCatching {
            val url = baseUrl + "api/mirrors/$mirrorId/status"
            val request = baseRequestBuilder(url).get().build()
            withContext(Dispatchers.IO) {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        val code = response.code
                        val body = try { response.body?.string()?.take(200) } catch (_: Throwable) { null }
                        val msg = if (!body.isNullOrBlank()) "HTTP $code: $body" else "HTTP $code"
                        throw IOException(msg)
                    }
                }
            }
        }
    }

    override fun observeEvents(): Flow<RemoteEvent> = relayClient.observe(details)

    private suspend fun executePost(url: String, body: JsonElement) {
        val requestBody = json.encodeToString(body).toRequestBody("application/json".toMediaType())
        val request = baseRequestBuilder(url)
            .post(requestBody)
            .build()
        withContext(Dispatchers.IO) {
            client.newCall(request).execute().use { response -> ensureSuccess(response) }
        }
    }

    private fun baseRequestBuilder(url: String): Request.Builder {
        val builder = Request.Builder().url(url)
        builder.addHeader("Authorization", "Bearer $accessToken")
        return builder
    }

    private fun ensureSuccess(response: Response) {
        if (!response.isSuccessful) {
            val code = response.code
            val body = try { response.body?.string()?.take(200) } catch (_: Throwable) { null }
            val msg = if (!body.isNullOrBlank()) "HTTP $code: $body" else "HTTP $code"
            throw IOException(msg)
        }
    }
}


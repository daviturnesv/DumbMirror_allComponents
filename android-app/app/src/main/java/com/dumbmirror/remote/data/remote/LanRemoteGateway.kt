package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.ConnectionConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

private const val DEFAULT_TIMEOUT_SECONDS = 10L

class LanRemoteGateway(
    private val config: ConnectionConfig,
    private val json: Json = Json { ignoreUnknownKeys = true }
) : RemoteGateway {

    private val service: RemoteControlService by lazy { createService() }

    override suspend fun sendCommand(command: String, payload: Map<String, Any?>): Result<Unit> {
        return runCatching {
            val payloadJson = payload.takeIf { it.isNotEmpty() }?.let { map ->
                json.encodeToString(JsonElement.serializer(), map.toJsonElement())
            }
            val response = service.sendNotification(notification = command, payload = payloadJson)
            ensureSuccess(response)
        }
    }

    override suspend fun testConnection(): Result<Unit> {
        return runCatching {
            val response = service.testConnection()
            ensureSuccess(response)
        }
    }

    override fun observeEvents(): Flow<RemoteEvent> = emptyFlow()

    private fun ensureSuccess(response: Response<ResponseBody>) {
        if (!response.isSuccessful) {
            throw HttpException(response)
        }
    }

    private fun createService(): RemoteControlService {
        val baseUrl = config.normalizedBaseUrl()
        val clientBuilder = OkHttpClient.Builder()
            .connectTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)

        config.token?.takeIf { it.isNotBlank() }?.let { token ->
            clientBuilder.addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .build()
                chain.proceed(request)
            }
        }

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .client(clientBuilder.build())
            .build()

        return retrofit.create(RemoteControlService::class.java)
    }
}

private fun Map<String, Any?>.toJsonElement(): JsonElement {
    return JsonObject(entries.associate { (key, value) ->
        key to value.toJsonElement()
    })
}

private fun Any?.toJsonElement(): JsonElement = when (this) {
    null -> JsonNull
    is JsonElement -> this
    is String -> JsonPrimitive(this)
    is Number -> JsonPrimitive(this)
    is Boolean -> JsonPrimitive(this)
    is Map<*, *> -> JsonObject(this.entries.associate { (k, v) ->
        k.toString() to v.toJsonElement()
    })
    is Iterable<*> -> buildJsonArray {
        for (item in this@toJsonElement) {
            add(item.toJsonElement())
        }
    }
    else -> JsonPrimitive(this.toString())
}

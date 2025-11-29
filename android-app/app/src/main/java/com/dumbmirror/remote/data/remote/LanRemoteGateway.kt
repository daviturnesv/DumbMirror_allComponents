package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.ConnectionConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
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



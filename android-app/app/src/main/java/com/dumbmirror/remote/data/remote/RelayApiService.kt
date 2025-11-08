package com.dumbmirror.remote.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface RelayApiService {

    @POST("api/users")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @GET("api/auth/me")
    suspend fun whoAmI(@Header("Authorization") authHeader: String): Response<UserMeResponse>

    @GET("api/mirrors")
    suspend fun listMirrors(@Header("Authorization") authHeader: String): Response<MirrorsResponse>

    @POST("api/mirrors")
    suspend fun createMirror(
        @Header("Authorization") authHeader: String,
        @Body body: CreateMirrorRequest
    ): Response<CreateMirrorResponse>

    @GET("api/mirrors/{mirrorId}/status")
    suspend fun getMirrorStatus(
        @Header("Authorization") authHeader: String,
        @Path("mirrorId") mirrorId: String
    ): Response<MirrorStatusResponse>

    @GET("api/mirrors/{mirrorId}/sensors/latest")
    suspend fun getSensorLatest(
        @Header("Authorization") authHeader: String,
        @Path("mirrorId") mirrorId: String
    ): Response<SensorLatestResponse>

    @GET("api/mirrors/{mirrorId}/sensors/summary")
    suspend fun getSensorSummary(
        @Header("Authorization") authHeader: String,
        @Path("mirrorId") mirrorId: String
    ): Response<SensorSummaryResponse>

    @GET("api/mirrors/{mirrorId}/sensors/report")
    suspend fun getSensorReport(
        @Header("Authorization") authHeader: String,
        @Path("mirrorId") mirrorId: String
    ): Response<SensorReportResponse>
}

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class AuthResponse(
    val user: RelayUserDto,
    val token: String
)

@Serializable
data class UserMeResponse(
    val user: RelayUserDto
)

@Serializable
data class RelayUserDto(
    val id: String,
    val email: String
)

@Serializable
data class MirrorsResponse(
    val mirrors: List<RelayMirrorDto>
)

@Serializable
data class RelayMirrorDto(
    val id: String,
    val name: String,
    @SerialName("createdAt")
    val createdAt: Long? = null,
    val online: Boolean = false
)

@Serializable
data class CreateMirrorRequest(
    val name: String
)

@Serializable
data class CreateMirrorResponse(
    val mirror: RelayMirrorSecretDto
)

@Serializable
data class RelayMirrorSecretDto(
    val id: String,
    val name: String,
    val createdAt: Long? = null,
    val secret: String
)

@Serializable
data class MirrorStatusResponse(
    val mirror: RelayMirrorStatusDto
)

@Serializable
data class RelayMirrorStatusDto(
    val id: String,
    val name: String,
    val online: Boolean,
    val lastSeen: Long? = null
)

@Serializable
data class MirrorRefDto(
    val id: String
)

@Serializable
data class SensorLatestResponse(
    val mirror: MirrorRefDto,
    val sensor: SensorReadingDto
)

@Serializable
data class SensorSummaryResponse(
    val mirror: MirrorRefDto,
    val summary: SensorEnvelopeDto
)

@Serializable
data class SensorReportResponse(
    val mirror: MirrorRefDto,
    val report: SensorEnvelopeDto
)

@Serializable
data class SensorReadingDto(
    val ts: Long? = null,
    val temperature: Double? = null,
    val humidity: Double? = null,
    val light: Double? = null,
    val motion: JsonElement? = null,
    val forwardedAt: Long? = null,
    val receivedAt: Long? = null,
    val sender: String? = null
)

@Serializable
data class SensorEnvelopeDto(
    val data: JsonElement? = null,
    val forwardedAt: Long? = null,
    val receivedAt: Long? = null,
    val sender: String? = null
)

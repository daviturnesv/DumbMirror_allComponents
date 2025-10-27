package com.dumbmirror.remote.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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

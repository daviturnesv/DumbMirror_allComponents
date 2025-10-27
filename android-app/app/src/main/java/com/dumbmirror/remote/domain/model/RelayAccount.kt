package com.dumbmirror.remote.domain.model

data class RelayAccount(
    val baseUrl: String = "",
    val email: String = "",
    val accessToken: String? = null,
    val mirrorId: String? = null,
    val mirrorName: String? = null
) {
    val isAuthenticated: Boolean
        get() = baseUrl.isNotBlank() && !accessToken.isNullOrBlank()

    val hasMirrorSelected: Boolean
        get() = isAuthenticated && !mirrorId.isNullOrBlank()
}

data class RelayMirror(
    val id: String,
    val name: String,
    val createdAt: Long?,
    val online: Boolean
)

data class RelayMirrorWithSecret(
    val mirror: RelayMirror,
    val secret: String
)

data class RelayUser(
    val id: String,
    val email: String
)

data class RelaySession(
    val user: RelayUser,
    val token: String,
    val baseUrl: String
)

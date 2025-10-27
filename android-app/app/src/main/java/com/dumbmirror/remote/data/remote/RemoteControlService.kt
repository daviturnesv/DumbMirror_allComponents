package com.dumbmirror.remote.data.remote

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface RemoteControlService {
    @GET("remote")
    suspend fun testConnection(
        @Query("action") action: String = "MODULE_DATA"
    ): Response<ResponseBody>

    @GET("remote")
    suspend fun sendNotification(
        @Query("action") action: String = "NOTIFICATION",
        @Query("notification") notification: String,
        @Query("payload") payload: String? = null
    ): Response<ResponseBody>
}

package com.dumbmirror.remote.domain.model

import kotlinx.serialization.json.JsonElement

data class SensorReading(
    val timestampMs: Long?,
    val temperatureC: Double?,
    val humidityPercent: Double?,
    val lightLux: Double?,
    val motionFlag: Boolean?,
    val motionRaw: String?,
    val forwardedAt: Long?,
    val receivedAt: Long?,
    val sender: String?
)

data class SensorSummary(
    val data: JsonElement?,
    val forwardedAt: Long?,
    val receivedAt: Long?,
    val sender: String?
)

data class SensorReport(
    val data: JsonElement?,
    val forwardedAt: Long?,
    val receivedAt: Long?,
    val sender: String?
)

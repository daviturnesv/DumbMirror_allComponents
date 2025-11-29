package com.dumbmirror.remote.data.remote

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray

fun Map<String, Any?>.toJsonElement(): JsonElement {
    return JsonObject(entries.associate { (key, value) ->
        key to value.toJsonElement()
    })
}

@Suppress("UNCHECKED_CAST")
fun Any?.toJsonElement(): JsonElement = when (this) {
    null -> JsonNull
    is JsonElement -> this
    is Map<*, *> -> JsonObject(entries.associate { (key, value) ->
        key.toString() to value.toJsonElement()
    })
    is Iterable<*> -> buildJsonArray {
        for (item in this@toJsonElement) {
            add(item.toJsonElement())
        }
    }
    is Array<*> -> buildJsonArray {
        for (item in this@toJsonElement) {
            add(item.toJsonElement())
        }
    }
    is Boolean -> JsonPrimitive(this)
    is Number -> JsonPrimitive(this)
    is String -> JsonPrimitive(this)
    else -> JsonPrimitive(this.toString())
}

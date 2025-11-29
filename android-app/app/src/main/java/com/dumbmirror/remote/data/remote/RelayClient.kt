package com.dumbmirror.remote.data.remote

import com.dumbmirror.remote.domain.model.RelayDetails
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import io.socket.engineio.client.transports.Polling
import io.socket.engineio.client.transports.WebSocket
import org.json.JSONArray
import org.json.JSONObject

class RelayClient {

	fun observe(details: RelayDetails): Flow<RemoteEvent> {
		val mirrorId = details.mirrorId?.takeIf { it.isNotBlank() }
			?: throw IllegalStateException("Mirror ID não configurado.")
		val baseUrl = details.normalizedBaseUrl().trimEnd('/')
		require(baseUrl.isNotEmpty()) { "Endereço do Relay inválido." }
		val namespaceUrl = "$baseUrl/mirror"

		return callbackFlow {
			val options = IO.Options().apply {
				forceNew = true
				reconnection = true
				reconnectionAttempts = Int.MAX_VALUE
				reconnectionDelay = 1_000L
				reconnectionDelayMax = 10_000L
				timeout = 10_000L
				transports = arrayOf(WebSocket.NAME, Polling.NAME)
				details.accessToken?.takeIf { it.isNotBlank() }?.let { token ->
					extraHeaders = mapOf("Authorization" to listOf("Bearer $token"))
				}
			}

			val socket = try {
				IO.socket(namespaceUrl, options)
			} catch (error: Exception) {
				close(error)
				return@callbackFlow
			}

			val listeners = mutableListOf<Pair<String, Emitter.Listener>>()

			fun register(event: String, handler: (Array<out Any?>) -> Unit) {
				val listener = Emitter.Listener { args -> handler(args) }
				socket.on(event, listener)
				listeners += event to listener
			}

			register(Socket.EVENT_CONNECT) {
				trySend(RemoteEvent("socket-connect", mapOf("connected" to true)))
			}

			register(Socket.EVENT_DISCONNECT) { args ->
				val reason = args.firstOrNull()?.toString() ?: "unknown"
				trySend(RemoteEvent("socket-disconnect", mapOf("reason" to reason)))
			}

			register(Socket.EVENT_CONNECT_ERROR) { args ->
				val message = args.firstOrNull()?.toString() ?: "connection-error"
				trySend(RemoteEvent("socket-error", mapOf("message" to message)))
			}

			register("mirror-status") { args ->
				val payload = args.firstOrNull() as? JSONObject ?: return@register
				val eventMirrorId = payload.optString("mirrorId", null) ?: return@register
				if (eventMirrorId != mirrorId) return@register
				trySend(RemoteEvent("mirror-status", payload.toCompatMap()))
			}

			register("command-result") { args ->
				val payload = args.firstOrNull() as? JSONObject ?: return@register
				val eventMirrorId = payload.optString("mirrorId", null) ?: return@register
				if (eventMirrorId != mirrorId) return@register
				trySend(RemoteEvent("command-result", payload.toCompatMap()))
			}

			register("mirror-event") { args ->
				val payload = args.firstOrNull() as? JSONObject ?: return@register
				val eventMirrorId = payload.optString("mirrorId", null) ?: return@register
				if (eventMirrorId != mirrorId) return@register
				trySend(RemoteEvent("mirror-event", payload.toCompatMap()))
			}

			socket.connect()

			awaitClose {
				listeners.forEach { (event, listener) -> socket.off(event, listener) }
				socket.disconnect()
				socket.close()
			}
		}.flowOn(Dispatchers.IO)
	}
}

private fun JSONObject.toCompatMap(): Map<String, Any?> {
	val result = mutableMapOf<String, Any?>()
	val keys = keys()
	while (keys.hasNext()) {
		val key = keys.next()
		result[key] = opt(key).toDynamicValue()
	}
	return result.toMap()
}

private fun JSONArray.toCompatList(): List<Any?> {
	val result = ArrayList<Any?>(length())
	for (index in 0 until length()) {
		result += opt(index).toDynamicValue()
	}
	return result
}

private fun Any?.toDynamicValue(): Any? = when (this) {
	null, JSONObject.NULL -> null
	is JSONObject -> this.toCompatMap()
	is JSONArray -> this.toCompatList()
	else -> this
}

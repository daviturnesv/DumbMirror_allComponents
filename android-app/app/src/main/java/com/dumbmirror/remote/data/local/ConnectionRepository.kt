package com.dumbmirror.remote.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.dumbmirror.remote.domain.model.ConnectionConfig
import com.dumbmirror.remote.domain.model.ConnectionMode
import com.dumbmirror.remote.domain.model.RelayDetails
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private const val DATA_STORE_NAME = "connection_settings"

private val Context.connectionDataStore: DataStore<Preferences> by preferencesDataStore(name = DATA_STORE_NAME)

class ConnectionRepository(private val context: Context) {

    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")
        val TOKEN = stringPreferencesKey("token")
        val MODE = stringPreferencesKey("mode")
        val RELAY_BASE_URL = stringPreferencesKey("relay_base_url")
        val RELAY_TOKEN = stringPreferencesKey("relay_token")
        val RELAY_MIRROR_ID = stringPreferencesKey("relay_mirror_id")
        val RELAY_MIRROR_NAME = stringPreferencesKey("relay_mirror_name")
    }

    private val dataStore: DataStore<Preferences>
        get() = context.connectionDataStore

    fun observeConfig(): Flow<ConnectionConfig> {
        return dataStore.data.map { prefs ->
            val mode = prefs[Keys.MODE]?.let { runCatching { ConnectionMode.valueOf(it) }.getOrNull() }
                ?: ConnectionMode.LAN
            ConnectionConfig(
                mode = mode,
                baseUrl = prefs[Keys.BASE_URL] ?: "",
                token = prefs[Keys.TOKEN],
                relay = RelayDetails(
                    baseUrl = prefs[Keys.RELAY_BASE_URL] ?: "",
                    accessToken = prefs[Keys.RELAY_TOKEN],
                    mirrorId = prefs[Keys.RELAY_MIRROR_ID],
                    mirrorName = prefs[Keys.RELAY_MIRROR_NAME]
                )
            )
        }
    }

    suspend fun saveConfig(config: ConnectionConfig) {
        dataStore.edit { prefs ->
            prefs[Keys.MODE] = config.mode.name

            val normalizedBaseUrl = config.baseUrl.trim()
            if (normalizedBaseUrl.isEmpty()) prefs.remove(Keys.BASE_URL) else prefs[Keys.BASE_URL] = normalizedBaseUrl

            val token = config.token?.takeIf { it.isNotBlank() }
            if (token == null) prefs.remove(Keys.TOKEN) else prefs[Keys.TOKEN] = token

            val relayBase = config.relay.baseUrl.trim()
            if (relayBase.isEmpty()) prefs.remove(Keys.RELAY_BASE_URL) else prefs[Keys.RELAY_BASE_URL] = relayBase

            val relayToken = config.relay.accessToken?.takeIf { it.isNotBlank() }
            if (relayToken == null) prefs.remove(Keys.RELAY_TOKEN) else prefs[Keys.RELAY_TOKEN] = relayToken

            val mirrorId = config.relay.mirrorId?.takeIf { it.isNotBlank() }
            if (mirrorId == null) prefs.remove(Keys.RELAY_MIRROR_ID) else prefs[Keys.RELAY_MIRROR_ID] = mirrorId

            val mirrorName = config.relay.mirrorName?.takeIf { it.isNotBlank() }
            if (mirrorName == null) prefs.remove(Keys.RELAY_MIRROR_NAME) else prefs[Keys.RELAY_MIRROR_NAME] = mirrorName
        }
    }
}

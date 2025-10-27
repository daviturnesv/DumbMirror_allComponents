package com.dumbmirror.remote.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.dumbmirror.remote.domain.model.RelayAccount
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private const val DATA_STORE_NAME = "relay_account"

private val Context.relayAccountDataStore: DataStore<Preferences> by preferencesDataStore(name = DATA_STORE_NAME)

class RelayAccountRepository(private val context: Context) {

    private object Keys {
        val BASE_URL = stringPreferencesKey("relay_base_url")
        val EMAIL = stringPreferencesKey("relay_email")
        val TOKEN = stringPreferencesKey("relay_token")
        val MIRROR_ID = stringPreferencesKey("relay_mirror_id")
        val MIRROR_NAME = stringPreferencesKey("relay_mirror_name")
    }

    private val dataStore: DataStore<Preferences>
        get() = context.relayAccountDataStore

    fun observeAccount(): Flow<RelayAccount> {
        return dataStore.data.map { prefs ->
            RelayAccount(
                baseUrl = prefs[Keys.BASE_URL] ?: "",
                email = prefs[Keys.EMAIL] ?: "",
                accessToken = prefs[Keys.TOKEN],
                mirrorId = prefs[Keys.MIRROR_ID],
                mirrorName = prefs[Keys.MIRROR_NAME]
            )
        }
    }

    suspend fun saveAccount(account: RelayAccount) {
        dataStore.edit { prefs ->
            prefs[Keys.BASE_URL] = account.baseUrl.trim()
            prefs[Keys.EMAIL] = account.email.trim()
            val token = account.accessToken?.takeIf { it.isNotBlank() }
            if (token == null) prefs.remove(Keys.TOKEN) else prefs[Keys.TOKEN] = token
            val mirrorId = account.mirrorId?.takeIf { it.isNotBlank() }
            if (mirrorId == null) prefs.remove(Keys.MIRROR_ID) else prefs[Keys.MIRROR_ID] = mirrorId
            val mirrorName = account.mirrorName?.takeIf { it.isNotBlank() }
            if (mirrorName == null) prefs.remove(Keys.MIRROR_NAME) else prefs[Keys.MIRROR_NAME] = mirrorName
        }
    }

    suspend fun clearAccount() {
        dataStore.edit { prefs -> prefs.clear() }
    }
}

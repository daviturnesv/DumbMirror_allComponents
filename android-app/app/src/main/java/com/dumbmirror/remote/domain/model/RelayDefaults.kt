package com.dumbmirror.remote.domain.model

private val IP_ADDRESS_REGEX = Regex("^(\\d{1,3}\\.){3}\\d{1,3}(?::\\d+)?$")

object RelayDefaults {
    const val DEFAULT_BASE_URL: String = "https://dumbmirror-relayserver.onrender.com/"

    fun normalizeBaseUrl(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return ""
        val withScheme = when {
            trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true) -> trimmed
            looksLikeLocalHost(trimmed) -> "http://$trimmed"
            IP_ADDRESS_REGEX.matches(trimmed) -> "http://$trimmed"
            else -> "https://$trimmed"
        }
        return ConnectionConfig.fromRelay(withScheme, null, null).relay.baseUrl
    }

    private fun looksLikeLocalHost(value: String): Boolean {
        val lower = value.lowercase()
        return lower == "localhost" ||
            lower.startsWith("localhost:") ||
            lower == "127.0.0.1" ||
            lower.startsWith("127.0.0.1:") ||
            lower.startsWith("10.") ||
            lower.startsWith("192.168.") ||
            lower.startsWith("172.16.") ||
            lower.startsWith("172.17.") ||
            lower.startsWith("172.18.") ||
            lower.startsWith("172.19.") ||
            lower.startsWith("172.20.") ||
            lower.startsWith("172.21.") ||
            lower.startsWith("172.22.") ||
            lower.startsWith("172.23.") ||
            lower.startsWith("172.24.") ||
            lower.startsWith("172.25.") ||
            lower.startsWith("172.26.") ||
            lower.startsWith("172.27.") ||
            lower.startsWith("172.28.") ||
            lower.startsWith("172.29.") ||
            lower.startsWith("172.30.") ||
            lower.startsWith("172.31.")
    }
}

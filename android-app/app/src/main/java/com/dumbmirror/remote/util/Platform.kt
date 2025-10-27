package com.dumbmirror.remote.util

import android.os.Build

object PlatformInfo {
    // Heurística comum para detectar emulador Android
    val isEmulator: Boolean by lazy {
        val product = Build.PRODUCT?.lowercase() ?: ""
        val fingerprint = Build.FINGERPRINT?.lowercase() ?: ""
        val model = Build.MODEL?.lowercase() ?: ""
        val brand = Build.BRAND?.lowercase() ?: ""
        val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
        listOf(product, fingerprint, model, brand, manufacturer).any {
            it.contains("sdk") || it.contains("emulator") || it.contains("generic")
        }
    }
}

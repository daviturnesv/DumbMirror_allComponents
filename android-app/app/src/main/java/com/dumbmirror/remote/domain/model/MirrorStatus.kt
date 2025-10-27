package com.dumbmirror.remote.domain.model

data class MirrorStatus(
    val currentPage: String = "",
    val lastReportAt: Long? = null,
    val nowPlaying: String? = null,
    val summaryAvailable: Boolean = false
)

package com.dumbmirror.remote

import android.app.Application

class RemoteApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppGraph.initialize(this)
    }
}

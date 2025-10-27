package com.dumbmirror.remote

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.dumbmirror.remote.ui.DumbMirrorApp
import com.dumbmirror.remote.ui.theme.DumbMirrorTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            DumbMirrorTheme {
                DumbMirrorApp()
            }
        }
    }
}

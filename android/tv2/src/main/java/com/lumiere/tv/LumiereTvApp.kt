package com.lumiere.tv

import android.app.Application
import android.graphics.Bitmap
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.request.allowRgb565
import coil3.request.bitmapConfig
import coil3.request.crossfade

class LumiereTvApp : Application(), SingletonImageLoader.Factory {

    override fun onCreate() {
        super.onCreate()
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            android.util.Log.e("LumiereTV", "CRASH in thread ${thread.name}: ${throwable.message}", throwable)
            try {
                val crashFile = filesDir.resolve("last_crash.log")
                crashFile.writeText("Time: ${java.util.Date()}\nThread: ${thread.name}\nException: ${throwable.stackTraceToString()}")
            } catch (_: Exception) {}
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader {
        return ImageLoader.Builder(context)
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizePercent(context, 0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(context.cacheDir.resolve("image_cache"))
                    .maxSizeBytes(150L * 1024 * 1024)
                    .build()
            }
            .crossfade(false)
            .allowRgb565(true)
            .bitmapConfig(Bitmap.Config.RGB_565)
            .build()
    }
}

# Compose Material 3 TV
-keep class androidx.tv.material3.** { *; }
-keep class androidx.compose.** { *; }

# Media3 ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Kotlinx Serialization & Retrofit
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
    @kotlinx.serialization.Serializable <fields>;
}
-keep class com.lumiere.core.model.** { *; }
-keep interface com.lumiere.core.network.** { *; }

# Coil 3
-keep class coil3.** { *; }
-dontwarn coil3.**

# OkHttp & Coroutines
-dontwarn okhttp3.**
-dontwarn kotlinx.coroutines.**

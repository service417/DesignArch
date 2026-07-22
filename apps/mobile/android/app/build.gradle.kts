plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "lk.designarc.designarc_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "lk.designarc.designarc_mobile"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // The dependency tree contains native code — image_picker pulls
        // path_provider, which pulls path_provider_android and in turn `jni`,
        // whose C++ is compiled per ABI by CMake.
        //
        // 32-bit x86 is excluded because it does not build: CMake 3.22.1 fails
        // its compiler ABI probe against NDK r28 for that target. It is also
        // pointless — no shipping Android device is 32-bit x86; it exists only
        // as a legacy emulator image. arm64-v8a covers real phones and x86_64
        // covers the development emulator.
        //
        // armeabi-v7a is likewise omitted: DesignArc targets current handsets,
        // and each extra ABI is another full native compile on every build.
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

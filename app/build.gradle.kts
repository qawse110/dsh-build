plugins {
    id("com.android.application")
}

android {
    namespace = "com.dsh.launcher"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.dsh.launcher"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        // 用于验证"非 debuggable 是否影响 seccomp/exec"：克隆 debug 但关闭 debuggable
        create("nondbg") {
            initWith(getByName("debug"))
            isDebuggable = false
            signingConfig = signingConfigs.getByName("debug")
            // 子模块(terminal-view 等)只声明 debug/release，这里回退到 debug 变体
            matchingFallbacks += listOf("debug", "release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // 内置终端需要原生 libtermux.so
    packaging {
        jniLibs.useLegacyPackaging = false
    }
}

dependencies {
    implementation(project(":terminal-view"))
    implementation("org.apache.commons:commons-compress:1.26.2")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}

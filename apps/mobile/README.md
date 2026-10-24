# Attune Android app

Attune is an Android-first Expo development build. Expo Go is not sufficient because the app
contains a local Kotlin module with a notification listener, foreground camera/microphone
services, a DND controller, and a real `InputMethodService` keyboard.

## Local development

From `apps/mobile`:

```powershell
npm install
npm run typecheck
npm test
npm run lint
npx expo prebuild --clean --platform android --no-install
npm run android
```

The first native build requires Android Studio/SDK, a configured `ANDROID_HOME`, Java, Gradle
wrapper access, and either a running emulator or an Android phone with USB debugging enabled.

## Native module

The local module is at `modules/attune-native` and is intentionally Android-only. Verify that it
is discovered before a build:

```powershell
npx expo-modules-autolinking resolve --platform android --json modules
```

The output must contain `@attune/native` and
`app.attune.attunenative.AttuneNativeModule`.

## Real-device setup

After installing the development build, grant only the capabilities you want to test through the
Attune onboarding/You screen:

- Notification access and Post notifications for Priority Inbox
- Notification policy access for Smart Focus
- Usage access for the usage-only attention baseline
- Microphone for Ambient Volume
- Camera only for the camera frame boundary; the gaze model is not bundled yet
- Enable Attune in Android keyboard settings for the real system IME

All denied permissions must leave an honest reduced or unavailable state. Do not enable the
development design preview when collecting professor-facing evidence.

## Checks

```powershell
npm run typecheck
npm test -- --run
npm run lint
```

Kotlin/JUnit checks run through the generated Android project's Gradle wrapper when Gradle and the
Android SDK are available:

```powershell
.\android\gradlew.bat :attune-native:testDebugUnitTest
```

The Android implementation is not exercised by Expo Go; native changes require rebuilding the
development APK.

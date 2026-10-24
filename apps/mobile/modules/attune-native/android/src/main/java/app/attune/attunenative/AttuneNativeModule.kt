package app.attune.attunenative

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import app.attune.attunenative.attention.AndroidUsageStatsSource
import app.attune.attunenative.attention.CameraAttentionRuntime
import app.attune.attunenative.attention.UsageStatsAttentionClassifier
import app.attune.attunenative.ambient.AmbientRuntime
import app.attune.attunenative.ambient.AmbientUserSettings
import app.attune.attunenative.ambient.AmbientUserSettingsStore
import app.attune.attunenative.context.AndroidContextSnapshotProvider
import app.attune.attunenative.context.InterruptibilityClassifier
import app.attune.attunenative.dnd.AndroidDndPolicyController
import app.attune.attunenative.dnd.DndRequest
import app.attune.attunenative.history.NativeHistoryStore
import app.attune.attunenative.keyboard.AttuneInputMethodService
import app.attune.attunenative.keyboard.EncryptedTokenLearnerStore
import app.attune.attunenative.keyboard.HinglishTokenLearner
import app.attune.attunenative.keyboard.KeyboardRuntime
import app.attune.attunenative.notification.AttuneNotificationListenerService
import app.attune.attunenative.notification.NotificationAccessChecker
import app.attune.attunenative.notification.FileNotificationDigestStore
import app.attune.attunenative.notification.NotificationFeedback
import app.attune.attunenative.notification.NotificationAdaptationSettings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AttuneNativeModule : Module() {
  private var observerCount = 0
  private val eventHandler = Handler(Looper.getMainLooper())
  private val eventListener: (String, Map<String, Any?>) -> Unit = { eventName, payload ->
    eventHandler.post { sendEvent(eventName, payload) }
  }

  override fun definition() = ModuleDefinition {
    Name("AttuneNative")

    Events(
      "onNotificationRanked",
      "onAmbientSample",
      "onAttentionFrame",
      "onNativeStatusChanged"
    )

    AsyncFunction("getStatusSnapshot") {
      statusSnapshot()
    }

    AsyncFunction("checkPermission") { permission: String ->
      checkPermission(permission)
    }

    AsyncFunction("openSettings") { setting: String ->
      openSettings(setting)
    }

    AsyncFunction("getNotificationRecords") { limit: Int? ->
      historyStore().notificationRecords(limit ?: 100).map { it.toMap() }
    }

    AsyncFunction("clearNotificationRecords") {
      val cleared = historyStore().clearNotifications()
      notificationDigestStore().clear()
      cleared
    }

    AsyncFunction("setNotificationAdaptationEnabled") { enabled: Boolean ->
      NotificationAdaptationSettings.setEnabled(requireContext(), enabled)
    }

    AsyncFunction("deleteNotificationRecord") { id: String ->
      val deleted = historyStore().deleteNotification(id)
      notificationDigestStore().remove(id)
      deleted
    }

    AsyncFunction("clearKeyboardLearning") {
      KeyboardRuntime.clearRequested = true
      KeyboardRuntime.learnedTokenCount = 0
      EncryptedTokenLearnerStore(requireContext()).clear()
    }

    AsyncFunction("getAmbientHistory") { limit: Int? ->
      historyStore().ambientSamples(limit ?: 240).map { it.toMap() }
    }

    AsyncFunction("getAmbientConfig") {
      AmbientUserSettingsStore(requireContext()).read().toMap()
    }

    AsyncFunction("setAmbientConfig") { minVolumeFraction: Double, maxVolumeFraction: Double, leaveHeadphonesAlone: Boolean ->
      AmbientUserSettingsStore(requireContext()).write(
        AmbientUserSettings(
          minVolumeFraction = minVolumeFraction.toFloat(),
          maxVolumeFraction = maxVolumeFraction.toFloat(),
          leaveHeadphonesAlone = leaveHeadphonesAlone
        )
      )
    }

    AsyncFunction("clearAmbientConfig") {
      AmbientUserSettingsStore(requireContext()).clear()
    }

    AsyncFunction("getHistory") { kind: String?, limit: Int? ->
      historySnapshot(kind, limit ?: 100)
    }

    AsyncFunction("clearAmbientHistory") {
      historyStore().clearAmbient()
    }

    AsyncFunction("clearHistory") { kind: String? ->
      clearHistory(kind)
    }

    AsyncFunction("submitNotificationFeedback") { id: String, feedback: String ->
      val parsed = NotificationFeedback.fromWire(feedback) ?: return@AsyncFunction false
      val updated = historyStore().updateNotificationFeedback(id, parsed) ?: return@AsyncFunction false
      true
    }

    AsyncFunction("getKeyboardSuggestions") { prefix: String, limit: Int? ->
      val learner = HinglishTokenLearner()
      EncryptedTokenLearnerStore(requireContext()).load(learner)
      learner.suggestions(prefix, limit ?: 5).map { suggestion ->
        mapOf("token" to suggestion.token, "count" to suggestion.count)
      }
    }

    AsyncFunction("getInterruptibility") {
      val context = requireContext()
      val snapshot = AndroidContextSnapshotProvider(context).snapshot()
      val decision = InterruptibilityClassifier().classify(snapshot)
      historyStore().recordContextIfChanged(decision, snapshot.capturedAtMs)
      decision.toMap() + mapOf(
        "capturedAtMs" to snapshot.capturedAtMs,
        "foregroundPackage" to snapshot.foregroundPackage,
        "usageAccessGranted" to snapshot.usageAccessGranted
      )
    }

    AsyncFunction("applyDnd") { enabled: Boolean, allowPrioritySenders: Boolean?, allowRepeatCallers: Boolean? ->
      val result = AndroidDndPolicyController(requireContext()).apply(
        DndRequest(
          enabled = enabled,
          allowPrioritySenders = allowPrioritySenders ?: true,
          allowRepeatCallers = allowRepeatCallers ?: true
        )
      )
      historyStore().recordDnd(enabled, result, System.currentTimeMillis())
      result.toMap()
    }

    AsyncFunction("startService") { service: String ->
      startService(service)
    }

    AsyncFunction("stopService") { service: String ->
      stopService(service)
    }

    OnStartObserving("onNotificationRanked") { beginObserving() }
    OnStartObserving("onAmbientSample") { beginObserving() }
    OnStartObserving("onAttentionFrame") { beginObserving() }
    OnStartObserving("onNativeStatusChanged") { beginObserving() }
    OnStopObserving("onNotificationRanked") { endObserving() }
    OnStopObserving("onAmbientSample") { endObserving() }
    OnStopObserving("onAttentionFrame") { endObserving() }
    OnStopObserving("onNativeStatusChanged") { endObserving() }

    OnDestroy {
      synchronized(this@AttuneNativeModule) {
        observerCount = 0
        AttuneEventHub.remove(eventListener)
      }
      eventHandler.removeCallbacksAndMessages(null)
    }
  }

  private fun requireContext(): Context = appContext.reactContext
    ?: throw IllegalStateException("Attune native context is not available")

  private fun historyStore(): NativeHistoryStore =
    NativeHistoryStore(requireContext().filesDir.resolve("attune_history.json"))

  private fun notificationDigestStore(): FileNotificationDigestStore =
    FileNotificationDigestStore(requireContext().filesDir.resolve("attune_notification_digest.json"))

  private fun historySnapshot(kind: String?, limit: Int): Map<String, Any?> {
    val store = historyStore()
    val boundedLimit = limit.coerceIn(0, 500)
    return when (kind?.trim()?.lowercase()) {
      "ambient", "volume" -> mapOf("kind" to "ambient", "records" to store.ambientSamples(boundedLimit).map { it.toMap() })
      "context", "interruptibility" -> mapOf("kind" to "context", "records" to store.contextHistory(boundedLimit).map { it.toMap() })
      "dnd", "focus" -> mapOf("kind" to "dnd", "records" to store.dndHistory(boundedLimit).map { it.toMap() })
      "attention", "screen_time" -> mapOf("kind" to "attention", "records" to store.attentionHistory(boundedLimit).map { it.toMap() })
      "notification", "notifications" -> mapOf("kind" to "notifications", "records" to store.notificationRecords(boundedLimit).map { it.toMap() })
      else -> mapOf(
        "kind" to "all",
        "ambient" to store.ambientSamples(boundedLimit).map { it.toMap() },
        "context" to store.contextHistory(boundedLimit).map { it.toMap() },
        "dnd" to store.dndHistory(boundedLimit).map { it.toMap() },
        "attention" to store.attentionHistory(boundedLimit).map { it.toMap() },
        "notifications" to store.notificationRecords(boundedLimit).map { it.toMap() }
      )
    }
  }

  private fun clearHistory(kind: String?): Boolean {
    val store = historyStore()
    return when (kind?.trim()?.lowercase()) {
      "ambient", "volume" -> store.clearAmbient()
      "context", "interruptibility" -> store.clearContext()
      "dnd", "focus" -> store.clearDnd()
      "attention", "screen_time" -> store.clearAttention()
      "notification", "notifications" -> {
        val cleared = store.clearNotifications()
        notificationDigestStore().clear()
        cleared
      }
      null, "", "all" -> {
        val cleared = store.clearAll()
        notificationDigestStore().clear()
        cleared
      }
      else -> false
    }
  }

  private fun beginObserving() {
    synchronized(this) {
      observerCount += 1
      if (observerCount == 1) AttuneEventHub.add(eventListener)
    }
  }

  private fun endObserving() {
    synchronized(this) {
      observerCount = (observerCount - 1).coerceAtLeast(0)
      if (observerCount == 0) AttuneEventHub.remove(eventListener)
    }
  }

  private fun statusSnapshot(): Map<String, Any?> {
    val context = requireContext()
    val dnd = AndroidDndPolicyController(context)
    val contextSnapshot = AndroidContextSnapshotProvider(context).snapshot()
    val usageSource = AndroidUsageStatsSource(context)
    val usageWindow = usageSource.window()
    val attention = UsageStatsAttentionClassifier().classify(usageWindow)
    val nowMs = System.currentTimeMillis()
    val dayStartMs = nowMs - Math.floorMod(nowMs, 24L * 60 * 60 * 1000)
    if (usageWindow.usageAccessGranted && usageWindow.foregroundMs > 0L) {
      historyStore().upsertAttentionSnapshot(dayStartMs, usageWindow.foregroundMs, attention)
    }
    val permissions = mapOf(
      "notificationAccess" to NotificationAccessChecker.isEnabled(context),
      "postNotifications" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        hasRuntimePermission(context, Manifest.permission.POST_NOTIFICATIONS)
      } else true,
      "dndPolicy" to dnd.hasPolicyAccess(),
      "usageAccess" to usageWindow.usageAccessGranted,
      "activityRecognition" to contextSnapshot.activityRecognitionAccessGranted,
      "calendar" to contextSnapshot.calendarAccessGranted,
      "location" to (contextSnapshot.fineLocationAccessGranted || contextSnapshot.coarseLocationAccessGranted),
      "camera" to hasRuntimePermission(context, Manifest.permission.CAMERA),
      "microphone" to hasRuntimePermission(context, Manifest.permission.RECORD_AUDIO),
      "batteryExemption" to isIgnoringBatteryOptimizations(context),
      "keyboardEnabled" to isKeyboardSelected(context)
    )
    return mapOf(
      "permissions" to permissions,
      "notificationAccess" to NotificationAccessChecker.isEnabled(context),
      "notificationListenerConnected" to app.attune.attunenative.notification.NotificationListenerRuntime.connected,
      "dndPolicyAccess" to dnd.hasPolicyAccess(),
      "dndFilter" to dnd.currentFilter(),
      "usageStatsAccess" to usageWindow.usageAccessGranted,
      "calendarAccess" to contextSnapshot.calendarAccessGranted,
      "calendarBusy" to contextSnapshot.calendarBusy,
      "foregroundPackage" to contextSnapshot.foregroundPackage,
      "context" to contextSnapshot.statusMap(),
      "wifiSsid" to contextSnapshot.wifiSsid,
      "wifiSsidSource" to contextSnapshot.wifiSsidSource,
      "cameraPermission" to hasRuntimePermission(context, Manifest.permission.CAMERA),
      "microphonePermission" to hasRuntimePermission(context, Manifest.permission.RECORD_AUDIO),
      "camera" to CameraAttentionRuntime.status.toMap(),
      "ambient" to mapOf(
        "running" to AmbientRuntime.running,
        "lastDb" to AmbientRuntime.lastDb,
        "environment" to AmbientRuntime.environment,
        "source" to AmbientRuntime.source,
        "confidence" to AmbientRuntime.confidence,
        "lastDecision" to AmbientRuntime.lastDecision?.toMap(),
        "error" to AmbientRuntime.error
      ),
      "keyboardSelected" to isKeyboardSelected(context),
      "keyboardLearningAllowed" to KeyboardRuntime.learningAllowed,
      "keyboardLearnedTokenCount" to KeyboardRuntime.learnedTokenCount,
      "keyboard" to mapOf(
        "wordsLearned" to KeyboardRuntime.learnedTokenCount,
        "correctionsAvoided" to 0,
        "keystrokesSaved" to 0,
        "federated" to mapOf(
          "joined" to false,
          "rounds" to 0,
          "modelVersion" to null,
          "lastSync" to null,
          "epsilon" to null
        )
      ),
      "attention" to attention.toMap(),
      "usageWindow" to mapOf(
        "foregroundMs" to usageWindow.foregroundMs,
        "topPackage" to usageWindow.topPackage,
        "source" to "usage_stats"
      )
    )
  }

  private fun checkPermission(permission: String): Boolean {
    val context = requireContext()
    return when (permission.trim().lowercase()) {
      "notification_access", "notifications" -> NotificationAccessChecker.isEnabled(context)
      "post_notifications", "post-notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        hasRuntimePermission(context, Manifest.permission.POST_NOTIFICATIONS)
      } else true
      "dnd_policy", "notification_policy" -> AndroidDndPolicyController(context).hasPolicyAccess()
      "usage_stats", "usage" -> AndroidContextSnapshotProvider(context).hasUsageStatsAccess()
      "calendar" -> contextSnapshotHasCalendarAccess(context)
      "activity_recognition", "activity" -> AndroidContextSnapshotProvider(context).hasActivityRecognitionAccess()
      "location" -> AndroidContextSnapshotProvider(context).hasLocationAccess()
      "camera" -> hasRuntimePermission(context, Manifest.permission.CAMERA)
      "microphone", "audio" -> hasRuntimePermission(context, Manifest.permission.RECORD_AUDIO)
      "battery_exemption", "battery" -> isIgnoringBatteryOptimizations(context)
      "keyboard", "keyboard_selected" -> isKeyboardSelected(context)
      else -> false
    }
  }

  private fun openSettings(setting: String): Boolean {
    val context = requireContext()
    val intent = when (setting.trim().lowercase()) {
      "notification_access", "notifications" -> Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
      "dnd_policy", "notification_policy" -> AndroidDndPolicyController(context).settingsIntent()
      "usage_stats", "usage" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      "battery_exemption", "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      "calendar" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
      }
      "keyboard", "keyboard_selected" -> Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)
      "camera", "microphone", "audio" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
      }
      "app", "application" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
      }
      else -> return false
    }
    return runCatching {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }.getOrDefault(false)
  }

  private fun startService(service: String): Boolean {
    val context = requireContext()
    val intent = when (service.trim().lowercase()) {
      "attention", "camera" -> {
        if (!hasRuntimePermission(context, Manifest.permission.CAMERA)) return false
        Intent(context, app.attune.attunenative.attention.AttuneAttentionCameraService::class.java)
      }
      "ambient", "audio", "volume" -> {
        if (!hasRuntimePermission(context, Manifest.permission.RECORD_AUDIO)) return false
        Intent(context, app.attune.attunenative.ambient.AttuneAmbientAudioService::class.java)
      }
      "notification", "notifications" -> {
        if (!NotificationAccessChecker.isEnabled(context)) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          android.service.notification.NotificationListenerService.requestRebind(
            ComponentName(context, AttuneNotificationListenerService::class.java)
          )
          return true
        }
        return false
      }
      else -> return false
    }
    return runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    }.getOrDefault(false)
  }

  private fun stopService(service: String): Boolean {
    val context = requireContext()
    val intent = when (service.trim().lowercase()) {
      "attention", "camera" -> Intent(context, app.attune.attunenative.attention.AttuneAttentionCameraService::class.java)
      "ambient", "audio", "volume" -> Intent(context, app.attune.attunenative.ambient.AttuneAmbientAudioService::class.java)
      else -> return false
    }
    return context.stopService(intent)
  }

  private fun hasRuntimePermission(context: Context, permission: String): Boolean =
    runCatching { context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED }.getOrDefault(false)

  private fun isIgnoringBatteryOptimizations(context: Context): Boolean = runCatching {
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    power.isIgnoringBatteryOptimizations(context.packageName)
  }.getOrDefault(false)

  private fun contextSnapshotHasCalendarAccess(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

  private fun isKeyboardSelected(context: Context): Boolean {
    val selected = Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
      ?: return false
    val expected = ComponentName(context, AttuneInputMethodService::class.java)
    return selected == expected.flattenToString()
  }
}

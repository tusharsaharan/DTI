package app.attune.attunenative.context

enum class ActivityKind {
  STILL,
  WALKING,
  VEHICLE,
  UNKNOWN
}

enum class InterruptibilityLevel {
  OPEN,
  LIMITED,
  FOCUSED,
  UNKNOWN
}

data class ContextSnapshot(
  val capturedAtMs: Long,
  val activity: ActivityKind = ActivityKind.UNKNOWN,
  val calendarBusy: Boolean = false,
  val locationProfile: String? = null,
  val foregroundPackage: String? = null,
  val headphonesConnected: Boolean = false,
  val charging: Boolean = false,
  val calendarAccessGranted: Boolean = false,
  val usageAccessGranted: Boolean = false,
  val activityRecognitionAccessGranted: Boolean = false,
  val activitySignalAvailable: Boolean = false,
  val activitySource: String = "not_implemented",
  val fineLocationAccessGranted: Boolean = false,
  val coarseLocationAccessGranted: Boolean = false,
  val locationServicesEnabled: Boolean = false,
  val locationSource: String = "not_implemented",
  val wifiAccessGranted: Boolean = false,
  val nearbyWifiAccessGranted: Boolean = false,
  val wifiSsid: String? = null,
  val wifiSsidSource: String = "unavailable",
  val captureWarnings: List<String> = emptyList()
) {
  /**
   * Status is deliberately separate from the values above.  A false value can mean either
   * "there is no signal" or "the signal could not be read"; callers need to know which one.
   */
  fun statusMap(): Map<String, Any?> = mapOf(
    "activityRecognitionPermissionGranted" to activityRecognitionAccessGranted,
    "activitySignalAvailable" to activitySignalAvailable,
    "activitySource" to activitySource,
    "calendarAccessGranted" to calendarAccessGranted,
    "calendarSignalAvailable" to (calendarAccessGranted || calendarBusy),
    "usageAccessGranted" to usageAccessGranted,
    "foregroundAppAvailable" to (usageAccessGranted && !foregroundPackage.isNullOrBlank()),
    "fineLocationPermissionGranted" to fineLocationAccessGranted,
    "coarseLocationPermissionGranted" to coarseLocationAccessGranted,
    "locationPermissionGranted" to (fineLocationAccessGranted || coarseLocationAccessGranted),
    "locationServicesEnabled" to locationServicesEnabled,
    "locationProfileAvailable" to !locationProfile.isNullOrBlank(),
    "locationSource" to locationSource,
    "wifiAccessGranted" to wifiAccessGranted,
    "nearbyWifiPermissionGranted" to nearbyWifiAccessGranted,
    "wifiSsidAvailable" to !wifiSsid.isNullOrBlank(),
    "wifiSsidSource" to wifiSsidSource,
    "captureWarnings" to captureWarnings
  )
}

data class InterruptibilityDecision(
  val score: Int?,
  val level: InterruptibilityLevel,
  val shouldSuppress: Boolean,
  val reasonCodes: List<String>,
  val source: String,
  val confidence: String = "unknown",
  val contextStatus: Map<String, Any?> = emptyMap()
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "score" to score,
    "level" to level.name,
    "shouldSuppress" to shouldSuppress,
    "reasonCodes" to reasonCodes,
    "source" to source,
    "confidence" to confidence,
    "contextStatus" to contextStatus
  )
}

class InterruptibilityClassifier {
  fun classify(snapshot: ContextSnapshot): InterruptibilityDecision {
    val hasForegroundSignal = snapshot.usageAccessGranted && !snapshot.foregroundPackage.isNullOrBlank()
    val hasCalendarSignal = snapshot.calendarAccessGranted || snapshot.calendarBusy
    val hasActivitySignal = snapshot.activity != ActivityKind.UNKNOWN
    val hasLocationSignal = !snapshot.locationProfile.isNullOrBlank()
    val hasWifiSignal = !snapshot.wifiSsid.isNullOrBlank()
    val hasUsableContext = hasForegroundSignal || hasCalendarSignal || hasActivitySignal || hasLocationSignal || hasWifiSignal

    if (!hasUsableContext) {
      val limitations = unavailableReasonCodes(snapshot)
      return InterruptibilityDecision(
        score = null,
        level = InterruptibilityLevel.UNKNOWN,
        shouldSuppress = false,
        reasonCodes = (listOf("insufficient_context") + limitations).distinct(),
        source = "available_signals",
        confidence = "unknown",
        contextStatus = snapshot.statusMap()
      )
    }

    var score = 70
    val reasons = mutableListOf<String>()
    if (snapshot.calendarBusy) {
      score -= 38
      reasons += "calendar_busy"
    }
    when (snapshot.activity) {
      ActivityKind.VEHICLE -> {
        score -= 28
        reasons += "in_vehicle"
      }
      ActivityKind.STILL -> {
        score -= 12
        reasons += "still"
      }
      ActivityKind.WALKING -> {
        score -= 8
        reasons += "walking"
      }
      ActivityKind.UNKNOWN -> Unit
    }

    if (snapshot.headphonesConnected) {
      // Headphones are a weak focus signal. They do not, by themselves, turn DND on.
      score -= 10
      reasons += "headphones_connected"
    }
    if (snapshot.charging) reasons += "charging"

    when (foregroundCategory(snapshot.foregroundPackage)) {
      "meeting" -> {
        score -= 28
        reasons += "foreground_meeting"
      }
      "navigation" -> {
        score -= 18
        reasons += "foreground_navigation"
      }
      "media" -> {
        score -= 8
        reasons += "foreground_media"
      }
    }

    val bounded = score.coerceIn(0, 100)
    val level = when {
      bounded >= 65 -> InterruptibilityLevel.OPEN
      bounded >= 40 -> InterruptibilityLevel.LIMITED
      else -> InterruptibilityLevel.FOCUSED
    }
    val limitations = unavailableReasonCodes(snapshot)
    return InterruptibilityDecision(
      score = bounded,
      level = level,
      shouldSuppress = bounded <= 45,
      reasonCodes = (reasons.ifEmpty { listOf("no_suppressing_signal") } + limitations).distinct(),
      source = "available_signals",
      confidence = if (hasCalendarSignal && (hasForegroundSignal || hasActivitySignal)) "high" else "limited",
      contextStatus = snapshot.statusMap()
    )
  }

  private fun unavailableReasonCodes(snapshot: ContextSnapshot): List<String> = buildList {
    if (!snapshot.activitySignalAvailable) add("activity_signal_unavailable")
    if (!snapshot.calendarAccessGranted && !snapshot.calendarBusy) add("calendar_access_unavailable")
    if (!snapshot.usageAccessGranted) add("usage_access_unavailable")
    if (snapshot.usageAccessGranted && snapshot.foregroundPackage.isNullOrBlank()) {
      add("foreground_app_unavailable")
    }
    if (snapshot.locationProfile.isNullOrBlank()) add("location_profile_unavailable")
    if (snapshot.wifiSsid.isNullOrBlank()) add("wifi_ssid_unavailable")
  }

  private fun foregroundCategory(packageName: String?): String? {
    val packageId = packageName?.lowercase() ?: return null
    return when {
      packageId.contains("zoom") ||
        packageId.contains("meet") ||
        packageId.contains("teams") ||
        packageId.contains("webex") -> "meeting"
      packageId == "com.google.android.apps.maps" ||
        packageId.contains("waze") ||
        packageId.contains("navigation") -> "navigation"
      packageId.contains("youtube") ||
        packageId.contains("spotify") ||
        packageId.contains("netflix") -> "media"
      else -> null
    }
  }
}

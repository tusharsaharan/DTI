package app.attune.attunenative.attention

enum class AttentionLabel {
  ATTENDED,
  GLANCE,
  PASSIVE,
  NOT_IN_USE,
  USAGE_ONLY,
  UNKNOWN
}

data class AttentionSignals(
  val screenOn: Boolean,
  @Deprecated("Camera gaze is unavailable until an on-device gaze model is integrated")
  val cameraGazeProbability: Float? = null,
  val recentInteraction: Boolean = false,
  val proppedStill: Boolean = false,
  val vehicleNavigation: Boolean = false,
  val mediaWithoutInteraction: Boolean = false
)

data class AttentionClassification(
  val label: AttentionLabel,
  val confidence: Float,
  val source: String,
  val reason: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "label" to label.name,
    "confidence" to confidence,
    "source" to source,
    "reason" to reason
  )
}

class AttentionClassifier {
  fun classify(signals: AttentionSignals): AttentionClassification {
    if (!signals.screenOn) return AttentionClassification(AttentionLabel.NOT_IN_USE, 0.99f, "screen", "screen_off")
    if (signals.vehicleNavigation) return AttentionClassification(AttentionLabel.PASSIVE, 0.82f, "sensor_fusion", "vehicle_navigation")
    if (signals.proppedStill && signals.mediaWithoutInteraction) {
      return AttentionClassification(AttentionLabel.PASSIVE, 0.68f, "sensor_fusion", "passive_media")
    }
    if (signals.recentInteraction) return AttentionClassification(AttentionLabel.ATTENDED, 0.42f, "interaction", "recent_interaction")
    // Camera frames are intentionally not interpreted here. MediaPipe (or another
    // on-device gaze model) must be integrated before a camera signal can claim gaze.
    return AttentionClassification(AttentionLabel.UNKNOWN, 0.2f, "available_signals", "no_gaze_model")
  }
}

data class UsageAttentionWindow(
  val foregroundMs: Long,
  val usageAccessGranted: Boolean,
  val topPackage: String?,
  val status: String = "ok"
)

enum class UsageEventKind {
  FOREGROUND,
  BACKGROUND
}

data class UsageEventSample(
  val packageName: String,
  val timestampMs: Long,
  val kind: UsageEventKind
)

data class UsageForegroundState(
  val packageName: String?,
  val sinceMs: Long?
)

/** Pure reducer for UsageEvents, kept separate from Android framework access for testing. */
object UsageStatsWindowReducer {
  fun currentForeground(events: Iterable<UsageEventSample>): UsageForegroundState {
    var packageName: String? = null
    var sinceMs: Long? = null
    events.sortedBy { it.timestampMs }.forEach { event ->
      when (event.kind) {
        UsageEventKind.FOREGROUND -> {
          packageName = event.packageName
          sinceMs = event.timestampMs
        }
        UsageEventKind.BACKGROUND -> if (packageName == event.packageName) {
          packageName = null
          sinceMs = null
        }
      }
    }
    return UsageForegroundState(packageName, sinceMs)
  }
}

class UsageStatsAttentionClassifier {
  fun classify(window: UsageAttentionWindow): AttentionClassification {
    if (!window.usageAccessGranted) {
      return AttentionClassification(AttentionLabel.UNKNOWN, 0f, "usage_stats", "usage_access_required")
    }
    if (window.status == "usage_stats_unavailable") {
      return AttentionClassification(AttentionLabel.UNKNOWN, 0f, "usage_stats", "usage_stats_unavailable")
    }
    if (window.foregroundMs <= 0L) {
      return AttentionClassification(AttentionLabel.NOT_IN_USE, 0.8f, "usage_stats", "no_foreground_usage")
    }
    if (window.foregroundMs < 10_000L) {
      val reason = if (window.status == "aggregate_window") {
        "aggregate_foreground_window_without_gaze"
      } else {
        "short_foreground_window"
      }
      return AttentionClassification(AttentionLabel.GLANCE, 0.55f, "usage_stats", reason)
    }
    // UsageStats proves foreground time, not gaze. Keep this low-confidence and explicit.
    val reason = if (window.status == "aggregate_window") {
      "aggregate_foreground_time_without_gaze"
    } else {
      "foreground_time_without_gaze"
    }
    return AttentionClassification(AttentionLabel.USAGE_ONLY, 0.3f, "usage_stats", reason)
  }
}

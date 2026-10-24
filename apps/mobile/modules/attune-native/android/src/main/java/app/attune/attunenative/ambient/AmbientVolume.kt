package app.attune.attunenative.ambient

import kotlin.math.roundToInt

data class AmbientVolumeConfig(
  val quietDb: Float = 38f,
  val loudDb: Float = 78f,
  /** Compatibility defaults for callers that do not have an AudioManager range. */
  val minVolume: Int = 2,
  val maxVolume: Int = 12,
  val hysteresisDb: Float = 3f,
  val enabled: Boolean = true
)

enum class AmbientRingerMode {
  NORMAL,
  SILENT,
  VIBRATE,
  UNKNOWN
}

data class AmbientStatus(
  val running: Boolean,
  val db: Float?,
  val environment: String?,
  val source: String?,
  val confidence: Float?,
  val error: String?
)

object AmbientStatusFactory {
  fun unavailable(reason: String): AmbientStatus = AmbientStatus(
    running = false,
    db = null,
    environment = null,
    source = null,
    confidence = null,
    error = reason
  )
}

data class AmbientVolumeDecision(
  val inputDb: Float,
  val previousVolume: Int,
  val targetVolume: Int,
  val changed: Boolean,
  val reason: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "db" to inputDb,
    "previousVolume" to previousVolume,
    "targetVolume" to targetVolume,
    "changed" to changed,
    "reason" to reason
  )
}

class AmbientVolumeController(private val config: AmbientVolumeConfig = AmbientVolumeConfig()) {
  fun decide(db: Float, currentVolume: Int, headphonesConnected: Boolean): AmbientVolumeDecision =
    decide(
      db = db,
      currentVolume = currentVolume,
      minVolume = config.minVolume,
      maxVolume = config.maxVolume,
      headphonesConnected = headphonesConnected
    )

  fun decide(
    db: Float,
    currentVolume: Int,
    minVolume: Int = config.minVolume,
    maxVolume: Int = config.maxVolume,
    headphonesConnected: Boolean = false,
    ringerMode: AmbientRingerMode = AmbientRingerMode.NORMAL
  ): AmbientVolumeDecision {
    val boundedCurrent = currentVolume.coerceIn(minVolume.coerceAtMost(maxVolume), maxVolume.coerceAtLeast(minVolume))
    if (minVolume > maxVolume) {
      return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, "invalid_volume_range")
    }
    if (!config.enabled) return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, "disabled")
    if (ringerMode != AmbientRingerMode.NORMAL) {
      val reason = when (ringerMode) {
        AmbientRingerMode.SILENT -> "ringer_mode_silent"
        AmbientRingerMode.VIBRATE -> "ringer_mode_vibrate"
        AmbientRingerMode.UNKNOWN -> "ringer_mode_unknown"
        AmbientRingerMode.NORMAL -> error("unreachable")
      }
      return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, reason)
    }
    if (headphonesConnected) return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, "headphones_connected")
    if (!db.isFinite()) return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, "invalid_db")
    if (minVolume == maxVolume) return AmbientVolumeDecision(db, boundedCurrent, minVolume, false, "single_volume_step")
    if (config.loudDb <= config.quietDb || config.hysteresisDb < 0f) {
      return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, "invalid_curve")
    }

    val desired = ((db - config.quietDb) / (config.loudDb - config.quietDb) *
      (maxVolume - minVolume) + minVolume).roundToInt()
      .coerceIn(minVolume, maxVolume)
    val deltaDb = db - dbForVolume(boundedCurrent, minVolume, maxVolume)
    if (kotlin.math.abs(deltaDb) < config.hysteresisDb) {
      return AmbientVolumeDecision(db, boundedCurrent, boundedCurrent, false, "within_hysteresis")
    }
    return AmbientVolumeDecision(db, boundedCurrent, desired, desired != boundedCurrent, "ambient_curve")
  }

  private fun dbForVolume(volume: Int, minVolume: Int, maxVolume: Int): Float {
    val ratio = (volume - minVolume).toFloat() / (maxVolume - minVolume).coerceAtLeast(1)
    return config.quietDb + ratio * (config.loudDb - config.quietDb)
  }
}

object DecibelMeter {
  /** Converts a PCM16 window to calibrated dB SPL. The PCM array is not retained. */
  fun pcm16ToDb(samples: ShortArray, calibrationOffsetDb: Float = 90f): Float {
    if (samples.isEmpty()) return Float.NaN
    var sumSquares = 0.0
    samples.forEach { sample ->
      val normalized = sample.toDouble() / Short.MAX_VALUE
      sumSquares += normalized * normalized
    }
    val rms = kotlin.math.sqrt(sumSquares / samples.size).coerceAtLeast(1e-7)
    return (20.0 * kotlin.math.log10(rms) + calibrationOffsetDb).toFloat()
  }
}

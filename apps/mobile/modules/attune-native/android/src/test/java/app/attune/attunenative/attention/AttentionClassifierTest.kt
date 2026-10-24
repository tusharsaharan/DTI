package app.attune.attunenative.attention

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AttentionClassifierTest {
  private val classifier = AttentionClassifier()

  @Test
  fun cameraFrameDoesNotClaimGazeBeforeModelIntegration() {
    val result = classifier.classify(AttentionSignals(screenOn = true, cameraGazeProbability = 0.9f))

    assertEquals(AttentionLabel.UNKNOWN, result.label)
    assertEquals("no_gaze_model", result.reason)
    assertTrue(result.confidence < 0.3f)
  }

  @Test
  fun usageFallbackStatesItsLimitation() {
    val result = UsageStatsAttentionClassifier().classify(
      UsageAttentionWindow(foregroundMs = 120_000L, usageAccessGranted = true, topPackage = "com.example")
    )

    assertEquals(AttentionLabel.USAGE_ONLY, result.label)
    assertEquals("foreground_time_without_gaze", result.reason)
  }

  @Test
  fun usageEventsReduceToTheCurrentlyResumedPackage() {
    val state = UsageStatsWindowReducer.currentForeground(
      listOf(
        UsageEventSample("com.first", 100L, UsageEventKind.FOREGROUND),
        UsageEventSample("com.first", 200L, UsageEventKind.BACKGROUND),
        UsageEventSample("com.second", 300L, UsageEventKind.FOREGROUND)
      )
    )

    assertEquals("com.second", state.packageName)
    assertEquals(300L, state.sinceMs)
  }

  @Test
  fun unavailableUsageStatsNeverPretendsToMeasureAttention() {
    val result = UsageStatsAttentionClassifier().classify(
      UsageAttentionWindow(0L, usageAccessGranted = true, topPackage = null, status = "usage_stats_unavailable")
    )

    assertEquals(AttentionLabel.UNKNOWN, result.label)
    assertEquals("usage_stats_unavailable", result.reason)
    assertEquals(0f, result.confidence)
  }

  @Test
  fun cameraFrameBoundaryExposesNoGazeModelAndNullableConfidence() {
    val event = CameraFrameBoundary.observe(123L, 4L).toMap()

    assertEquals("no_gaze_model", event["status"])
    assertEquals("camera_frame", event["source"])
    assertEquals(null, event["confidence"])
    assertEquals(null, event["environment"])
  }

  @Test
  fun cameraStartingStateIsNotReportedAsRunning() {
    val status = CameraRuntimeStatus(
      running = false,
      permissionGranted = true,
      frontCameraAvailable = true,
      state = "starting"
    )

    assertFalse(status.running)
    assertEquals("no_gaze_model", status.toMap()["status"])
  }
}

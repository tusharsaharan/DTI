package app.attune.attunenative.context

import android.content.ContextWrapper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InterruptibilityTest {
  @Test
  fun calendarAndVehicleContextSuppressesInterruptions() {
    val result = InterruptibilityClassifier().classify(
      ContextSnapshot(
        capturedAtMs = 1L,
        activity = ActivityKind.VEHICLE,
        activityRecognitionAccessGranted = true,
        activitySignalAvailable = true,
        activitySource = "test",
        calendarBusy = true,
        usageAccessGranted = true
      )
    )

    assertEquals(InterruptibilityLevel.FOCUSED, result.level)
    assertTrue(result.shouldSuppress)
    assertTrue("calendar_busy" in result.reasonCodes)
    assertTrue("in_vehicle" in result.reasonCodes)
  }

  @Test
  fun missingSignalsAreHonestAndDoNotSuppress() {
    val result = InterruptibilityClassifier().classify(ContextSnapshot(capturedAtMs = 1L))

    assertEquals(InterruptibilityLevel.UNKNOWN, result.level)
    assertFalse(result.shouldSuppress)
    assertEquals(null, result.score)
    assertTrue("usage_access_unavailable" in result.reasonCodes)
    assertTrue("activity_signal_unavailable" in result.reasonCodes)
  }

  @Test
  fun permissionsDoNotPretendThatUnimplementedSignalsExist() {
    val snapshot = ContextSnapshot(
      capturedAtMs = 1L,
      activityRecognitionAccessGranted = true,
      fineLocationAccessGranted = true,
      locationServicesEnabled = true,
      activitySource = "not_implemented",
      locationSource = "not_implemented"
    )

    val result = InterruptibilityClassifier().classify(snapshot)

    assertEquals(InterruptibilityLevel.UNKNOWN, result.level)
    assertFalse(result.shouldSuppress)
    assertEquals(false, result.contextStatus["activitySignalAvailable"])
    assertEquals("not_implemented", result.contextStatus["activitySource"])
    assertEquals(false, result.contextStatus["locationProfileAvailable"])
    assertEquals("not_implemented", result.contextStatus["locationSource"])
  }

  @Test
  fun foregroundMeetingAndHeadphonesLowerInterruptibilityWithStatus() {
    val result = InterruptibilityClassifier().classify(
      ContextSnapshot(
        capturedAtMs = 1L,
        foregroundPackage = "us.zoom.videomeetings",
        headphonesConnected = true,
        usageAccessGranted = true
      )
    )

    assertEquals(InterruptibilityLevel.FOCUSED, result.level)
    assertTrue(result.shouldSuppress)
    assertTrue("foreground_meeting" in result.reasonCodes)
    assertTrue("headphones_connected" in result.reasonCodes)
    assertEquals("limited", result.confidence)
  }

  @Test
  fun deniedOrUnavailableAndroidServicesProduceSafeSnapshot() {
    val snapshot = AndroidContextSnapshotProvider(ContextWrapper(null)).snapshot()

    assertEquals(ActivityKind.UNKNOWN, snapshot.activity)
    assertFalse(snapshot.activitySignalAvailable)
    assertFalse(snapshot.calendarAccessGranted)
    assertFalse(snapshot.usageAccessGranted)
    assertNull(snapshot.locationProfile)
    assertNull(snapshot.wifiSsid)
    assertEquals("not_implemented", snapshot.activitySource)
    assertEquals("not_implemented", snapshot.locationSource)
  }
}

package app.attune.attunenative.ambient

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AmbientVolumeTest {
  @Test
  fun volumeChangesOnlyOutsideHysteresisBand() {
    val controller = AmbientVolumeController(
      AmbientVolumeConfig(quietDb = 40f, loudDb = 80f, minVolume = 2, maxVolume = 12, hysteresisDb = 3f)
    )

    val stable = controller.decide(db = 60f, currentVolume = 7)
    val loud = controller.decide(db = 80f, currentVolume = 7)

    assertFalse(stable.changed)
    assertEquals("within_hysteresis", stable.reason)
    assertTrue(loud.changed)
    assertEquals(12, loud.targetVolume)
  }

  @Test
  fun headphonesBlockAutomaticWrite() {
    val decision = AmbientVolumeController().decide(85f, currentVolume = 4, headphonesConnected = true)

    assertFalse(decision.changed)
    assertEquals("headphones_connected", decision.reason)
  }

  @Test
  fun deviceVolumeRangeControlsMappingInsteadOfConfiguredRange() {
    val controller = AmbientVolumeController(
      AmbientVolumeConfig(quietDb = 40f, loudDb = 80f, minVolume = 2, maxVolume = 12)
    )

    val decision = controller.decide(
      db = 80f,
      currentVolume = 3,
      minVolume = 1,
      maxVolume = 7
    )

    assertEquals(7, decision.targetVolume)
    assertTrue(decision.changed)
  }

  @Test
  fun silentAndVibrateModesNeverRequestAWrite() {
    val controller = AmbientVolumeController()

    val silent = controller.decide(85f, currentVolume = 4, ringerMode = AmbientRingerMode.SILENT)
    val vibrate = controller.decide(85f, currentVolume = 4, ringerMode = AmbientRingerMode.VIBRATE)

    assertFalse(silent.changed)
    assertEquals("ringer_mode_silent", silent.reason)
    assertFalse(vibrate.changed)
    assertEquals("ringer_mode_vibrate", vibrate.reason)
  }

  @Test
  fun microphoneFallbackDoesNotInventSignalFields() {
    val status = AmbientStatusFactory.unavailable("microphone_permission_required")

    assertFalse(status.running)
    assertEquals(null, status.db)
    assertEquals(null, status.environment)
    assertEquals(null, status.source)
    assertEquals(null, status.confidence)
    assertEquals("microphone_permission_required", status.error)
  }

  @Test
  fun pcmSilenceIsFiniteAndBelowFullScale() {
    val silence = DecibelMeter.pcm16ToDb(ShortArray(1600))
    val fullScale = DecibelMeter.pcm16ToDb(ShortArray(1600) { Short.MAX_VALUE })

    assertTrue(silence.isFinite())
    assertTrue(silence < fullScale)
  }
}

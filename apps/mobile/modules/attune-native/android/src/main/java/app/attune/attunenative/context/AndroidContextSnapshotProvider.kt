package app.attune.attunenative.context

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.location.LocationManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.provider.CalendarContract

interface ContextSnapshotProvider {
  fun snapshot(): ContextSnapshot
}

class AndroidContextSnapshotProvider(private val context: Context) : ContextSnapshotProvider {
  override fun snapshot(): ContextSnapshot {
    val warnings = mutableListOf<String>()
    val usageAccess = safe(warnings, "usage_permission_check_failed", false) { hasUsageStatsAccess() }
    val calendarAccess = safe(warnings, "calendar_permission_check_failed", false) { hasCalendarAccess() }
    val activityRecognitionAccess = safe(
      warnings,
      "activity_recognition_permission_check_failed",
      false
    ) { hasActivityRecognitionAccess() }
    val fineLocationAccess = safe(warnings, "fine_location_permission_check_failed", false) {
      hasFineLocationAccess()
    }
    val coarseLocationAccess = safe(warnings, "coarse_location_permission_check_failed", false) {
      hasCoarseLocationAccess()
    }
    val locationServicesEnabled = safe(warnings, "location_services_check_failed", false) {
      locationServicesEnabled()
    }
    val wifiAccess = safe(warnings, "wifi_permission_check_failed", false) { hasWifiAccess() }
    val nearbyWifiAccess = safe(warnings, "nearby_wifi_permission_check_failed", false) {
      hasNearbyWifiAccess()
    }
    val wifi = safe(warnings, "wifi_ssid_read_failed", null) {
      readWifiSsid(
        locationAccessGranted = fineLocationAccess || coarseLocationAccess,
        locationServicesEnabled = locationServicesEnabled,
        wifiAccessGranted = wifiAccess,
        nearbyWifiAccessGranted = nearbyWifiAccess
      )
    }

    return ContextSnapshot(
      capturedAtMs = System.currentTimeMillis(),
      // Activity Recognition is declared and reported, but no transition client/classifier is
      // wired yet. Never turn the permission into a fabricated activity value.
      activity = ActivityKind.UNKNOWN,
      foregroundPackage = if (usageAccess) {
        safe(warnings, "foreground_app_read_failed", null) { foregroundPackage() }
      } else {
        null
      },
      headphonesConnected = safe(warnings, "headphones_read_failed", false) { headphonesConnected() },
      charging = safe(warnings, "charging_read_failed", false) { charging() },
      calendarBusy = if (calendarAccess) {
        safe(warnings, "calendar_read_failed", false) { calendarBusy() }
      } else {
        false
      },
      calendarAccessGranted = calendarAccess,
      usageAccessGranted = usageAccess,
      activityRecognitionAccessGranted = activityRecognitionAccess,
      activitySignalAvailable = false,
      activitySource = "not_implemented",
      fineLocationAccessGranted = fineLocationAccess,
      coarseLocationAccessGranted = coarseLocationAccess,
      locationServicesEnabled = locationServicesEnabled,
      // No location provider/geofence is implemented in this module. A Wi-Fi SSID is exposed
      // separately as a best-effort local network signal; it is not a location claim.
      locationSource = "not_implemented",
      wifiAccessGranted = wifiAccess,
      nearbyWifiAccessGranted = nearbyWifiAccess,
      wifiSsid = wifi,
      wifiSsidSource = wifiSsidSource(
        wifiSsid = wifi,
        locationAccessGranted = fineLocationAccess || coarseLocationAccess,
        locationServicesEnabled = locationServicesEnabled,
        wifiAccessGranted = wifiAccess,
        nearbyWifiAccessGranted = nearbyWifiAccess
      ),
      captureWarnings = warnings.distinct()
    )
  }

  fun hasCalendarAccess(): Boolean = hasPermission(Manifest.permission.READ_CALENDAR)

  fun hasActivityRecognitionAccess(): Boolean =
    hasPermission(Manifest.permission.ACTIVITY_RECOGNITION)

  fun hasFineLocationAccess(): Boolean = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)

  fun hasCoarseLocationAccess(): Boolean = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)

  fun hasLocationAccess(): Boolean = hasFineLocationAccess() || hasCoarseLocationAccess()

  fun hasWifiAccess(): Boolean = hasPermission(Manifest.permission.ACCESS_WIFI_STATE)

  fun hasNearbyWifiAccess(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
    hasPermission(Manifest.permission.NEARBY_WIFI_DEVICES)

  private fun calendarBusy(): Boolean {
    val now = System.currentTimeMillis()
    val uri = CalendarContract.Instances.CONTENT_URI.buildUpon()
      .appendPath(now.toString())
      .appendPath((now + 60 * 60 * 1000L).toString())
      .build()
    return runCatching {
      context.contentResolver.query(
        uri,
        arrayOf(CalendarContract.Instances.EVENT_ID),
        null,
        null,
        null
      )?.use { cursor -> cursor.moveToFirst() } == true
    }.getOrDefault(false)
  }

  fun hasUsageStatsAccess(): Boolean = runCatching {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        context.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        context.packageName
      )
    }
    mode == AppOpsManager.MODE_ALLOWED
  }.getOrDefault(false)

  private fun foregroundPackage(): String? = runCatching {
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return null
    val now = System.currentTimeMillis()
    val events = manager.queryEvents(now - 15 * 60 * 1000L, now)
    val event = UsageEvents.Event()
    var current: String? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED ||
        event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
      ) {
        current = event.packageName?.takeUnless { it.isBlank() }
      }
    }
    current
  }.getOrNull()

  private fun headphonesConnected(): Boolean = runCatching {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { device ->
        device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
          device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
          device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
      }
    } else {
      @Suppress("DEPRECATION")
      audio.isWiredHeadsetOn
    }
  }.getOrDefault(false)

  private fun charging(): Boolean {
    val battery = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      battery.isCharging
    } else {
      false
    }
  }

  private fun locationServicesEnabled(): Boolean {
    val location = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      location.isLocationEnabled
    } else {
      @Suppress("DEPRECATION")
      location.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        location.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
  }

  private fun readWifiSsid(
    locationAccessGranted: Boolean,
    locationServicesEnabled: Boolean,
    wifiAccessGranted: Boolean,
    nearbyWifiAccessGranted: Boolean
  ): String? {
    // Android deliberately hides the SSID without the relevant runtime location/nearby state.
    // Returning null here is safer than treating a redacted value as a real place signal.
    if (!wifiAccessGranted || (!locationAccessGranted && !nearbyWifiAccessGranted)) return null
    if (!nearbyWifiAccessGranted && !locationServicesEnabled) return null
    return runCatching {
      val wifi = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
      @Suppress("DEPRECATION")
      val rawSsid = wifi.connectionInfo?.ssid ?: return null
      rawSsid.trim('"').takeUnless {
        it.isBlank() || it == WifiManager.UNKNOWN_SSID || it == "<unknown ssid>"
      }
    }.getOrNull()
  }

  private fun wifiSsidSource(
    wifiSsid: String?,
    locationAccessGranted: Boolean,
    locationServicesEnabled: Boolean,
    wifiAccessGranted: Boolean,
    nearbyWifiAccessGranted: Boolean
  ): String = when {
    wifiSsid != null -> "wifi_ssid"
    !wifiAccessGranted || (!locationAccessGranted && !nearbyWifiAccessGranted) -> "permission_denied"
    !nearbyWifiAccessGranted && !locationServicesEnabled -> "location_services_disabled"
    else -> "unavailable"
  }

  private fun hasPermission(permission: String): Boolean = runCatching {
    if (context is ContextWrapper && context.baseContext == null) return false
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }.getOrDefault(false)

  private fun <T> safe(
    warnings: MutableList<String>,
    warning: String,
    fallback: T,
    block: () -> T
  ): T = runCatching(block).getOrElse {
    warnings += warning
    fallback
  }
}

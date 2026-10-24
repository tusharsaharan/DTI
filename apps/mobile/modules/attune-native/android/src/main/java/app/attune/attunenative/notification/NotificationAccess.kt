package app.attune.attunenative.notification

import android.content.ComponentName
import android.content.Context
import android.provider.Settings

object NotificationAccessChecker {
  fun isEnabled(context: Context): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    val expected = ComponentName(context, AttuneNotificationListenerService::class.java)
    return enabled.split(':').any { value -> value == expected.flattenToString() }
  }
}

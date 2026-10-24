package app.attune.attunenative.attention

import android.app.usage.UsageStatsManager
import android.app.usage.UsageEvents
import android.content.Context
import app.attune.attunenative.context.AndroidContextSnapshotProvider

class AndroidUsageStatsSource(private val context: Context) {
  private val contextProvider = AndroidContextSnapshotProvider(context)

  fun window(durationMs: Long = 60 * 60 * 1000L): UsageAttentionWindow {
    val granted = contextProvider.hasUsageStatsAccess()
    if (!granted) return UsageAttentionWindow(0L, false, null)
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return UsageAttentionWindow(0L, true, null, "usage_stats_unavailable")
    val now = System.currentTimeMillis()
    val start = now - durationMs.coerceAtLeast(1L)
    val events = runCatching {
      val usageEvents = manager.queryEvents(start, now)
      val event = UsageEvents.Event()
      buildList {
        while (usageEvents.hasNextEvent()) {
          usageEvents.getNextEvent(event)
          val kind = when (event.eventType) {
            UsageEvents.Event.ACTIVITY_RESUMED,
            UsageEvents.Event.MOVE_TO_FOREGROUND -> UsageEventKind.FOREGROUND
            UsageEvents.Event.ACTIVITY_PAUSED,
            UsageEvents.Event.ACTIVITY_STOPPED,
            UsageEvents.Event.MOVE_TO_BACKGROUND -> UsageEventKind.BACKGROUND
            else -> null
          }
          if (kind != null && !event.packageName.isNullOrBlank()) {
            add(UsageEventSample(event.packageName, event.timeStamp, kind))
          }
        }
      }
    }.getOrElse { emptyList() }
    val current = UsageStatsWindowReducer.currentForeground(events)
    if (current.packageName != null && current.sinceMs != null) {
      return UsageAttentionWindow(
        foregroundMs = (now - current.sinceMs).coerceAtLeast(0L),
        usageAccessGranted = true,
        topPackage = current.packageName,
        status = "active_foreground"
      )
    }

    // Some OEMs expose aggregate stats but no event stream. Preserve that real,
    // lower-fidelity fallback and label it so callers do not mistake it for gaze.
    val stats = runCatching { manager.queryAndAggregateUsageStats(start, now) }.getOrNull()
    val top = stats?.maxByOrNull { it.value.totalTimeInForeground }
    val foregroundMs = stats?.values?.sumOf { it.totalTimeInForeground } ?: 0L
    return UsageAttentionWindow(
      foregroundMs = foregroundMs,
      usageAccessGranted = true,
      topPackage = top?.key,
      status = if (stats == null) "usage_stats_unavailable" else if (foregroundMs > 0L) "aggregate_window" else "no_foreground"
    )
  }
}

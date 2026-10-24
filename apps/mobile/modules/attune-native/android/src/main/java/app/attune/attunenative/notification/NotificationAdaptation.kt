package app.attune.attunenative.notification

import android.content.Context
import java.util.Locale

enum class NotificationAdaptationAction {
  KEEP_ORIGINAL,
  CANCEL_TO_DIGEST,
  REPOST_ATTUNE,
  IGNORE_SELF
}

data class NotificationAdaptationInput(
  val score: Int,
  val isSelfNotification: Boolean,
  val isOngoing: Boolean,
  val hasContent: Boolean,
  val hasOpenOriginalFallback: Boolean,
  val canPostAttuneNotification: Boolean
)

data class NotificationAdaptationDecision(
  val action: NotificationAdaptationAction,
  val reasonCode: String
)

/** Pure policy for changing a real notification. Android side effects live in the listener. */
object NotificationAdaptationPolicy {
  const val LOW_SCORE_THRESHOLD = 35
  const val HIGH_SCORE_THRESHOLD = 60

  fun decide(input: NotificationAdaptationInput): NotificationAdaptationDecision {
    if (input.isSelfNotification) {
      return NotificationAdaptationDecision(NotificationAdaptationAction.IGNORE_SELF, "self_notification")
    }
    if (!input.hasContent) {
      return NotificationAdaptationDecision(NotificationAdaptationAction.KEEP_ORIGINAL, "no_content")
    }
    if (input.isOngoing) {
      return NotificationAdaptationDecision(NotificationAdaptationAction.KEEP_ORIGINAL, "ongoing_notification")
    }
    if (input.score < LOW_SCORE_THRESHOLD) {
      return NotificationAdaptationDecision(NotificationAdaptationAction.CANCEL_TO_DIGEST, "below_priority_threshold")
    }
    if (input.score >= HIGH_SCORE_THRESHOLD) {
      if (!input.canPostAttuneNotification) {
        return NotificationAdaptationDecision(
          NotificationAdaptationAction.KEEP_ORIGINAL,
          "attune_post_permission_unavailable"
        )
      }
      if (!input.hasOpenOriginalFallback) {
        return NotificationAdaptationDecision(
          NotificationAdaptationAction.KEEP_ORIGINAL,
          "missing_open_original_fallback"
        )
      }
      return NotificationAdaptationDecision(NotificationAdaptationAction.REPOST_ATTUNE, "above_priority_threshold")
    }
    return NotificationAdaptationDecision(NotificationAdaptationAction.KEEP_ORIGINAL, "within_priority_band")
  }
}

/** User-controlled native gate. Android notification access cannot be revoked by the app, so the
 * listener remains connected but preserves source notifications when Priority Inbox is disabled. */
object NotificationAdaptationSettings {
  private const val PREFERENCES = "attune_notification_settings"
  private const val KEY_ENABLED = "adaptation_enabled"

  fun isEnabled(context: Context): Boolean = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    .getBoolean(KEY_ENABLED, true)

  fun setEnabled(context: Context, enabled: Boolean): Boolean = context
    .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    .edit()
    .putBoolean(KEY_ENABLED, enabled)
    .commit()
}

object NotificationReasonFormatter {
  fun forScore(score: NotificationScore): String {
    val reasons = score.reasonCodes
      .filterNot { it == "sender_unknown" }
      .map(::humanize)
    return if (reasons.isEmpty()) {
      "priority score ${score.points}"
    } else {
      reasons.joinToString(", ")
    }
  }

  private fun humanize(value: String): String = value
    .removePrefix("sender_")
    .replace('_', ' ')
    .lowercase(Locale.ROOT)
    .replaceFirstChar { first -> first.titlecase(Locale.ROOT) }
}

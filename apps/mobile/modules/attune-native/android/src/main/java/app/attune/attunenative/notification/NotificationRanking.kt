package app.attune.attunenative.notification

import java.util.Locale

enum class SenderTier(val baseScore: Int) {
  FAMILY(42),
  CLOSE(34),
  CLASS(27),
  WORK(25),
  UNKNOWN(14)
}

enum class NotificationFeedback(val adjustment: Int) {
  NONE(0),
  OPENED(5),
  REPLIED(12),
  DISMISSED(-8),
  MARKED_IMPORTANT(22),
  MARKED_NOT_IMPORTANT(-24),
  FAMILY(0),
  CLOSE(0),
  CLASS(0),
  WORK(0);

  companion object {
    fun fromWire(value: String): NotificationFeedback? {
      val normalized = value.trim().replace('-', '_').replace(' ', '_')
      return values().firstOrNull { it.name.equals(normalized, ignoreCase = true) }
        ?: when (normalized.lowercase(Locale.ROOT)) {
          "important" -> MARKED_IMPORTANT
          "not_important", "notimportant" -> MARKED_NOT_IMPORTANT
          "family_contact" -> FAMILY
          "close_contact" -> CLOSE
          "classmate" -> CLASS
          "coworker" -> WORK
          else -> null
        }
    }
  }

  fun senderTierOverride(): SenderTier? = when (this) {
    FAMILY -> SenderTier.FAMILY
    CLOSE -> SenderTier.CLOSE
    CLASS -> SenderTier.CLASS
    WORK -> SenderTier.WORK
    else -> null
  }
}

data class UrgencySignals(
  val explicitUrgency: Boolean = false,
  val deadline: Boolean = false,
  val directMention: Boolean = false,
  val callbackRequest: Boolean = false,
  val timeSensitive: Boolean = false
) {
  val score: Int
    get() = listOf(
      explicitUrgency to 24,
      deadline to 18,
      directMention to 10,
      callbackRequest to 12,
      timeSensitive to 10
    ).filter { it.first }.sumOf { it.second }.coerceAtMost(50)

  val reasonCodes: List<String>
    get() = buildList {
      if (explicitUrgency) add("explicit_urgency")
      if (deadline) add("deadline")
      if (directMention) add("direct_mention")
      if (callbackRequest) add("callback_request")
      if (timeSensitive) add("time_sensitive")
    }
}

data class NotificationSignal(
  val senderTier: SenderTier,
  val urgency: UrgencySignals,
  val feedback: NotificationFeedback = NotificationFeedback.NONE
)

data class NotificationScore(
  val points: Int,
  val basePoints: Int,
  val urgencyScore: Int,
  val reasonCodes: List<String>
)

class NotificationScorer {
  fun score(signal: NotificationSignal): NotificationScore {
    val senderTier = signal.feedback.senderTierOverride() ?: signal.senderTier
    val base = (senderTier.baseScore + signal.urgency.score).coerceIn(0, 100)
    val reasons = buildList {
      add("sender_${senderTier.name.lowercase(Locale.ROOT)}")
      addAll(signal.urgency.reasonCodes)
      when (signal.feedback) {
        NotificationFeedback.NONE -> Unit
        NotificationFeedback.OPENED -> add("previously_opened")
        NotificationFeedback.REPLIED -> add("previously_replied")
        NotificationFeedback.DISMISSED -> add("previously_dismissed")
        NotificationFeedback.MARKED_IMPORTANT -> add("marked_important")
        NotificationFeedback.MARKED_NOT_IMPORTANT -> add("marked_not_important")
        NotificationFeedback.FAMILY,
        NotificationFeedback.CLOSE,
        NotificationFeedback.CLASS,
        NotificationFeedback.WORK -> add("sender_tag_${signal.feedback.name.lowercase(Locale.ROOT)}")
      }
    }
    return NotificationScore(
      points = (base + signal.feedback.adjustment).coerceIn(0, 100),
      basePoints = base,
      urgencyScore = signal.urgency.score,
      reasonCodes = reasons
    )
  }
}

/**
 * Resolves only explicit local sender/conversation tags. Without one, UNKNOWN is intentional:
 * response history can adjust a notification's score, but it cannot honestly identify family,
 * classmates, or work contacts by itself.
 */
object LocalSenderTierResolver {
  fun resolve(
    history: Iterable<NotificationRecord>,
    senderKey: String?,
    conversationKey: String?
  ): SenderTier {
    if (senderKey == null && conversationKey == null) return SenderTier.UNKNOWN

    val conversationMatch = history
      .filter { conversationKey != null && it.conversationKey == conversationKey }
      .sortedByDescending { it.postedAtMs }
      .mapNotNull { it.feedback.senderTierOverride() }
      .firstOrNull()
    if (conversationMatch != null) return conversationMatch

    return history
      .filter { senderKey != null && it.senderKey == senderKey }
      .sortedByDescending { it.postedAtMs }
      .mapNotNull { it.feedback.senderTierOverride() }
      .firstOrNull()
      ?: SenderTier.UNKNOWN
  }
}

/** Reuses the most recent explicit local response for the same conversation or sender. */
object LocalNotificationFeedbackResolver {
  fun resolve(
    history: Iterable<NotificationRecord>,
    senderKey: String?,
    conversationKey: String?
  ): NotificationFeedback {
    if (senderKey == null && conversationKey == null) return NotificationFeedback.NONE

    val matching = history
      .filter { record ->
        (conversationKey != null && record.conversationKey == conversationKey) ||
          (senderKey != null && record.senderKey == senderKey)
      }
      .sortedByDescending { it.postedAtMs }

    return matching
      .map { it.feedback }
      .firstOrNull { it != NotificationFeedback.NONE && it.senderTierOverride() == null }
      ?: NotificationFeedback.NONE
  }
}

object UrgencyDetector {
  private val explicitPattern = Regex("\\b(urgent|asap|immediately|emergency|jaldi|abhi|zaroori)\\b")
  private val deadlinePattern = Regex("\\b(deadline|due|submit|submission|assignment|exam|test|by \\d{1,2}([:/]\\d{1,2})?)\\b")
  private val callbackPattern = Regex("\\b(call me|phone me|ring me|callback|call back|baat karo)\\b")
  private val timePattern = Regex("\\b(today|tonight|tomorrow|aaj|kal|now|ab|\\d{1,2}(:\\d{2})?\\s?(am|pm)?)\\b")

  /** Text is inspected only for the duration of this call and is never returned or persisted. */
  fun detect(text: CharSequence?): UrgencySignals {
    val normalized = text?.toString()?.lowercase(Locale.ROOT)?.replace(Regex("\\s+"), " ") ?: return UrgencySignals()
    return UrgencySignals(
      explicitUrgency = explicitPattern.containsMatchIn(normalized),
      deadline = deadlinePattern.containsMatchIn(normalized),
      directMention = normalized.contains("@"),
      callbackRequest = callbackPattern.containsMatchIn(normalized),
      timeSensitive = timePattern.containsMatchIn(normalized)
    )
  }
}

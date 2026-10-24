package app.attune.attunenative.notification

import android.app.Notification
import android.app.Person
import android.os.Build
import android.os.Bundle

/**
 * A single message extracted from Android's MessagingStyle extras.
 *
 * The text fields in this model are deliberately short lived. They are used by the listener to
 * score and repost the notification, and are not included in NotificationRecord or event maps.
 */
data class ParsedNotificationMessage(
  val text: String,
  val senderName: String?,
  val senderIdentity: String?,
  val timestampMs: Long?
)

/** Android-independent view of notification extras used by the pure parsing rules. */
data class NotificationExtrasSnapshot(
  val title: String? = null,
  val text: String? = null,
  val bigText: String? = null,
  val conversationTitle: String? = null,
  val isGroupConversation: Boolean? = null,
  val template: String? = null,
  val messages: List<ParsedNotificationMessage> = emptyList()
)

data class ParsedNotification(
  val title: String,
  val text: String,
  val bigText: String?,
  val conversationTitle: String?,
  val isGroupConversation: Boolean?,
  val shortcutId: String?,
  val messages: List<ParsedNotificationMessage>,
  val isMessage: Boolean,
  val senderIdentity: String?,
  val senderKey: String?,
  val conversationKey: String?,
  val textForScoring: String,
  val displayTitle: String,
  val displayText: String
) {
  val hasDisplayContent: Boolean
    get() = title.isNotBlank() ||
      text.isNotBlank() ||
      !bigText.isNullOrBlank() ||
      !conversationTitle.isNullOrBlank() ||
      messages.isNotEmpty()

  val latestMessage: ParsedNotificationMessage?
    get() = messages.lastOrNull()
}

/** Reads notification metadata without retaining the source Notification object. */
object NotificationParser {
  private const val KEY_MESSAGE_TEXT = "text"
  private const val KEY_MESSAGE_TIMESTAMP = "time"
  private const val KEY_MESSAGE_SENDER = "sender"
  private const val KEY_MESSAGE_SENDER_PERSON = "sender_person"
  private const val KEY_IS_GROUP_CONVERSATION = "android.isGroupConversation"

  fun parse(notification: Notification, packageName: String? = null): ParsedNotification {
    val extras = notification.extras ?: Bundle()
    val shortcutId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notification.shortcutId
    } else {
      null
    }
    return parseExtras(
      extras = extras,
      packageName = packageName,
      shortcutId = shortcutId
    )
  }

  /**
   * Converts Android Bundle extras to the platform-independent parser input. Keeping this bridge
   * thin makes the notification rules JVM-testable without inventing external notifications.
   */
  fun parseExtras(
    extras: Bundle,
    packageName: String? = null,
    shortcutId: String? = null
  ): ParsedNotification {
    return parseSnapshot(
      snapshot = NotificationExtrasSnapshot(
        title = extras.charSequenceOrNull(Notification.EXTRA_TITLE),
        text = extras.charSequenceOrNull(Notification.EXTRA_TEXT),
        bigText = extras.charSequenceOrNull(Notification.EXTRA_BIG_TEXT),
        conversationTitle = extras.charSequenceOrNull(Notification.EXTRA_CONVERSATION_TITLE),
        isGroupConversation = extras.booleanOrNull(KEY_IS_GROUP_CONVERSATION),
        template = extras.stringOrNull(Notification.EXTRA_TEMPLATE),
        messages = readMessages(extras)
      ),
      packageName = packageName,
      shortcutId = shortcutId
    )
  }

  fun parseSnapshot(
    snapshot: NotificationExtrasSnapshot,
    packageName: String? = null,
    shortcutId: String? = null
  ): ParsedNotification {
    val title = snapshot.title.orEmpty()
    val text = snapshot.text.orEmpty()
    val bigText = snapshot.bigText
    val conversationTitle = snapshot.conversationTitle
    val isGroupConversation = snapshot.isGroupConversation
    val messages = snapshot.messages
    val template = snapshot.template.orEmpty()
    val isMessage = messages.isNotEmpty() ||
      template.contains("MessagingStyle", ignoreCase = true) ||
      messages.any { it.senderIdentity != null }
    val latestMessage = messages.lastOrNull()
    val senderIdentity = latestMessage?.senderIdentity ?: messages.asReversed()
      .firstOrNull { it.senderIdentity != null }
      ?.senderIdentity
    val senderKey = senderIdentity?.let { identityKey("sender", packageName, it) }
    val conversationMaterial = shortcutId
      ?: conversationTitle
      ?: if (isMessage && isGroupConversation == true) "group:${title.ifBlank { "unknown" }}" else null
    val conversationKey = conversationMaterial?.let { identityKey("conversation", packageName, it) }
    val messageText = messages.map { it.text }.filter { it.isNotBlank() }
    val textForScoring = (listOfNotNull(title, text, bigText, conversationTitle) + messageText)
      .filter { it.isNotBlank() }
      .distinct()
      .joinToString(" ")
    val displayTitle = conversationTitle?.takeIf { it.isNotBlank() }
      ?: title.takeIf { it.isNotBlank() }
      ?: latestMessage?.senderName?.takeIf { it.isNotBlank() }
      ?: packageName.orEmpty()
    val displayText = latestMessage?.text?.takeIf { it.isNotBlank() }
      ?: bigText?.takeIf { it.isNotBlank() }
      ?: text

    return ParsedNotification(
      title = title,
      text = text,
      bigText = bigText,
      conversationTitle = conversationTitle,
      isGroupConversation = isGroupConversation,
      shortcutId = shortcutId,
      messages = messages,
      isMessage = isMessage,
      senderIdentity = senderIdentity,
      senderKey = senderKey,
      conversationKey = conversationKey,
      textForScoring = textForScoring,
      displayTitle = displayTitle,
      displayText = displayText
    )
  }

  private fun readMessages(extras: Bundle): List<ParsedNotificationMessage> {
    val rawMessages = runCatching {
      extras.getParcelableArray(Notification.EXTRA_MESSAGES)
    }.getOrNull() ?: return emptyList()

    return rawMessages.mapNotNull { rawMessage ->
      val bundle = rawMessage as? Bundle ?: return@mapNotNull null
      val messageText = bundle.charSequenceOrNull(KEY_MESSAGE_TEXT)?.takeIf { it.isNotBlank() }
        ?: return@mapNotNull null
      val person = readPerson(bundle)
      val legacySender = bundle.charSequenceOrNull(KEY_MESSAGE_SENDER)
      val senderName = person?.name?.toString()?.takeIf { it.isNotBlank() } ?: legacySender
      val senderIdentity = person?.uri?.takeIf { it.isNotBlank() }
        ?: person?.key?.takeIf { it.isNotBlank() }
        ?: senderName
      val timestamp = runCatching {
        if (bundle.containsKey(KEY_MESSAGE_TIMESTAMP)) bundle.getLong(KEY_MESSAGE_TIMESTAMP) else null
      }.getOrNull()
      ParsedNotificationMessage(
        text = messageText,
        senderName = senderName,
        senderIdentity = senderIdentity,
        timestampMs = timestamp
      )
    }
  }

  private fun readPerson(bundle: Bundle): Person? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
    return runCatching {
      bundle.getParcelable(KEY_MESSAGE_SENDER_PERSON) as? Person
    }.getOrNull() ?: runCatching {
      bundle.getParcelable(KEY_MESSAGE_SENDER) as? Person
    }.getOrNull()
  }

  private fun identityKey(kind: String, packageName: String?, value: String): String {
    return stableNotificationId("$kind|${packageName.orEmpty()}|$value")
  }

  private fun Bundle.charSequenceOrNull(key: String): String? = runCatching {
    getCharSequence(key)?.toString()
  }.getOrNull()

  private fun Bundle.stringOrNull(key: String): String? = runCatching {
    getString(key)
  }.getOrNull()

  private fun Bundle.booleanOrNull(key: String): Boolean? = runCatching {
    if (containsKey(key)) getBoolean(key) else null
  }.getOrNull()
}

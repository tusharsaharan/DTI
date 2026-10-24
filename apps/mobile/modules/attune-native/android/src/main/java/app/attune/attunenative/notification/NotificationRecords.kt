package app.attune.attunenative.notification

import org.json.JSONArray
import org.json.JSONObject
import app.attune.attunenative.history.HistoryRetention
import app.attune.attunenative.history.NativeHistoryStore
import java.io.File
import java.security.MessageDigest
import java.util.Locale

data class NotificationRecord(
  val id: String,
  val packageName: String,
  val postedAtMs: Long,
  val senderTier: SenderTier,
  val urgencyScore: Int,
  val baseScore: Int,
  val score: Int,
  val reasonCodes: List<String>,
  val feedback: NotificationFeedback = NotificationFeedback.NONE,
  val senderKey: String? = null,
  val conversationKey: String? = null,
  val isMessage: Boolean = false,
  val adaptation: NotificationAdaptationAction = NotificationAdaptationAction.KEEP_ORIGINAL,
  val adaptationReason: String = "not_evaluated",
  val hasOpenOriginalFallback: Boolean = false,
  /** Ephemeral display metadata for the live event only; NotificationRecordCodec never persists it. */
  val sender: String? = null,
  val conversation: String? = null,
  val text: String? = null
) {
  fun withFeedback(next: NotificationFeedback): NotificationRecord {
    val nextSenderTier = next.senderTierOverride() ?: senderTier
    val nextBaseScore = (nextSenderTier.baseScore + urgencyScore).coerceIn(0, 100)
    val nextReasons = buildList {
      add("sender_${nextSenderTier.name.lowercase(Locale.ROOT)}")
      addAll(reasonCodes.filterNot { it.startsWith("sender_") })
      when (next) {
        NotificationFeedback.NONE -> Unit
        NotificationFeedback.OPENED -> add("previously_opened")
        NotificationFeedback.REPLIED -> add("previously_replied")
        NotificationFeedback.DISMISSED -> add("previously_dismissed")
        NotificationFeedback.MARKED_IMPORTANT -> add("marked_important")
        NotificationFeedback.MARKED_NOT_IMPORTANT -> add("marked_not_important")
        NotificationFeedback.FAMILY,
        NotificationFeedback.CLOSE,
        NotificationFeedback.CLASS,
        NotificationFeedback.WORK -> add("sender_tag_${next.name.lowercase(Locale.ROOT)}")
      }
    }.distinct()
    return copy(
      senderTier = nextSenderTier,
      baseScore = nextBaseScore,
      score = (nextBaseScore + next.adjustment).coerceIn(0, 100),
      reasonCodes = nextReasons,
      feedback = next
    )
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "postedAtMs" to postedAtMs,
    "senderTier" to senderTier.name,
    "urgencyScore" to urgencyScore,
    "baseScore" to baseScore,
    "score" to score,
    "reasonCodes" to reasonCodes,
    "feedback" to feedback.name,
    "senderKey" to senderKey,
    "conversationKey" to conversationKey,
    "isMessage" to isMessage,
    "adaptation" to adaptation.name,
    "adaptationReason" to adaptationReason,
    "hasOpenOriginalFallback" to hasOpenOriginalFallback,
    "sender" to sender,
    "conversation" to conversation,
    "text" to text
  )
}

interface NotificationRecordStore {
  fun upsert(record: NotificationRecord)
  fun append(record: NotificationRecord) = upsert(record)
  fun all(limit: Int = 100): List<NotificationRecord>
  fun find(id: String): NotificationRecord? = all(500).firstOrNull { it.id == id }
  fun updateFeedback(id: String, feedback: NotificationFeedback): NotificationRecord?
  fun delete(id: String): Boolean = false
  fun clear()
}

/** Codec for the long-term derived notification record. Display metadata is intentionally absent. */
object NotificationRecordCodec {
  fun encode(record: NotificationRecord): JSONObject = JSONObject().apply {
    put("id", record.id)
    put("packageName", record.packageName)
    put("postedAtMs", record.postedAtMs)
    put("senderTier", record.senderTier.name)
    put("urgencyScore", record.urgencyScore)
    put("baseScore", record.baseScore)
    put("score", record.score)
    put("feedback", record.feedback.name)
    put("senderKey", record.senderKey)
    put("conversationKey", record.conversationKey)
    put("isMessage", record.isMessage)
    put("adaptation", record.adaptation.name)
    put("adaptationReason", record.adaptationReason)
    put("hasOpenOriginalFallback", record.hasOpenOriginalFallback)
    put("reasonCodes", JSONArray().apply { record.reasonCodes.forEach { put(it) } })
  }

  fun decode(item: JSONObject): NotificationRecord? = runCatching {
    NotificationRecord(
      id = item.getString("id"),
      packageName = item.getString("packageName"),
      postedAtMs = item.getLong("postedAtMs"),
      senderTier = SenderTier.valueOf(item.optString("senderTier", SenderTier.UNKNOWN.name)),
      urgencyScore = item.optInt("urgencyScore", 0),
      baseScore = item.optInt("baseScore", SenderTier.UNKNOWN.baseScore),
      score = item.optInt("score", 0),
      reasonCodes = item.optJSONArray("reasonCodes")?.toStringList() ?: emptyList(),
      feedback = NotificationFeedback.fromWire(item.optString("feedback", "NONE"))
        ?: NotificationFeedback.NONE,
      senderKey = item.optString("senderKey", "").takeIf { it.isNotBlank() },
      conversationKey = item.optString("conversationKey", "").takeIf { it.isNotBlank() },
      isMessage = item.optBoolean("isMessage", false),
      adaptation = runCatching {
        NotificationAdaptationAction.valueOf(item.optString("adaptation", "KEEP_ORIGINAL"))
      }.getOrDefault(NotificationAdaptationAction.KEEP_ORIGINAL),
      adaptationReason = item.optString("adaptationReason", "not_evaluated"),
      hasOpenOriginalFallback = item.optBoolean("hasOpenOriginalFallback", false)
      // sender, conversation, and text are deliberately not read from disk. Older files are
      // migrated to the derived-only shape on the next write.
    )
  }.getOrNull()

  private fun JSONArray.toStringList(): List<String> = buildList {
    for (index in 0 until length()) {
      optString(index, "").takeIf { it.isNotBlank() }?.let(::add)
    }
  }
}

class InMemoryNotificationRecordStore : NotificationRecordStore {
  private val records = ArrayDeque<NotificationRecord>()

  @Synchronized
  override fun upsert(record: NotificationRecord) {
    val index = records.indexOfFirst { it.id == record.id }
    if (index >= 0) {
      records[index] = record
    } else {
      records.addFirst(record)
    }
    while (records.size > 500) records.removeLast()
  }

  @Synchronized
  override fun all(limit: Int): List<NotificationRecord> = records.take(limit.coerceIn(0, 500))

  @Synchronized
  override fun updateFeedback(id: String, feedback: NotificationFeedback): NotificationRecord? {
    val index = records.indexOfFirst { it.id == id }
    if (index < 0) return null
    val updated = records[index].withFeedback(feedback)
    records[index] = updated
    return updated
  }

  @Synchronized
  override fun delete(id: String): Boolean = records.removeAll { it.id == id }

  @Synchronized
  override fun clear() {
    records.clear()
  }
}

/** Existing notification-store contract backed by the shared durable history envelope. */
class FileNotificationRecordStore(
  file: File,
  retention: HistoryRetention = HistoryRetention(),
  nowMs: () -> Long = { System.currentTimeMillis() }
) : NotificationRecordStore {
  private val store = NativeHistoryStore(file, retention, nowMs)

  override fun upsert(record: NotificationRecord) {
    store.upsertNotification(record)
  }

  override fun all(limit: Int): List<NotificationRecord> = store.notificationRecords(limit)

  override fun updateFeedback(id: String, feedback: NotificationFeedback): NotificationRecord? =
    store.updateNotificationFeedback(id, feedback)

  override fun delete(id: String): Boolean = store.deleteNotification(id)

  override fun clear() {
    store.clearNotifications()
  }
}

internal fun stableNotificationId(notificationKey: String): String {
  val digest = MessageDigest.getInstance("SHA-256").digest(notificationKey.toByteArray(Charsets.UTF_8))
  return digest.joinToString("") { byte -> "%02x".format(byte) }
}

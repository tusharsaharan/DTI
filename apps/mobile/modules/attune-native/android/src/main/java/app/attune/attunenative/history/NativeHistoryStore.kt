package app.attune.attunenative.history

import app.attune.attunenative.attention.AttentionClassification
import app.attune.attunenative.context.InterruptibilityDecision
import app.attune.attunenative.dnd.DndResult
import app.attune.attunenative.notification.NotificationAdaptationAction
import app.attune.attunenative.notification.NotificationFeedback
import app.attune.attunenative.notification.NotificationRecord
import app.attune.attunenative.notification.SenderTier
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonSerializationContext
import com.google.gson.JsonSerializer
import com.google.gson.reflect.TypeToken
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.lang.reflect.Type
import java.util.Locale

/**
 * Retention policy for the small, derived-only native history database.
 *
 * The limits are deliberately bounded by both age and row count. A caller can use a smaller
 * limit when reading, but it cannot make the on-device history grow without bound.
 */
data class HistoryRetention(
  val notificationMaxRows: Int = 500,
  val ambientMaxRows: Int = 240,
  val contextMaxRows: Int = 500,
  val attentionMaxRows: Int = 90,
  val notificationRetentionMs: Long = 30L * 24 * 60 * 60 * 1000,
  val ambientRetentionMs: Long = 7L * 24 * 60 * 60 * 1000,
  val contextRetentionMs: Long = 30L * 24 * 60 * 60 * 1000,
  val attentionRetentionMs: Long = 90L * 24 * 60 * 60 * 1000
) {
  init {
    require(notificationMaxRows >= 1)
    require(ambientMaxRows >= 1)
    require(contextMaxRows >= 1)
    require(attentionMaxRows >= 1)
    require(notificationRetentionMs >= 0)
    require(ambientRetentionMs >= 0)
    require(contextRetentionMs >= 0)
    require(attentionRetentionMs >= 0)
  }
}

data class AmbientHistoryRecord(
  val id: String,
  val atMs: Long,
  val db: Float,
  val applied: Boolean,
  val targetVolume: Int,
  val ringVolume: Float?,
  val reason: String,
  val environment: String?,
  val source: String,
  val confidence: Float?
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "atMs" to atMs,
    "db" to db,
    "applied" to applied,
    "targetVolume" to targetVolume,
    "ringVolume" to ringVolume,
    "reason" to reason,
    "environment" to environment,
    "source" to source,
    "confidence" to confidence
  )
}

data class ContextHistoryRecord(
  val id: String,
  val atMs: Long,
  val level: String,
  val score: Int?,
  val shouldSuppress: Boolean,
  val reasonCodes: List<String>,
  val signalStatus: Map<String, Any?>
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "atMs" to atMs,
    "level" to level,
    "score" to score,
    "shouldSuppress" to shouldSuppress,
    "reasonCodes" to reasonCodes,
    "signalStatus" to signalStatus
  )
}

data class DndHistoryRecord(
  val id: String,
  val atMs: Long,
  val enabled: Boolean,
  val applied: Boolean,
  val restored: Boolean,
  val reason: String,
  val currentFilter: Int?,
  val snapshotCaptured: Boolean,
  val snapshotPresent: Boolean
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "atMs" to atMs,
    "enabled" to enabled,
    "applied" to applied,
    "restored" to restored,
    "reason" to reason,
    "currentFilter" to currentFilter,
    "snapshotCaptured" to snapshotCaptured,
    "snapshotPresent" to snapshotPresent
  )
}

data class AttentionHistoryRecord(
  val id: String,
  val dayStartMs: Long,
  val foregroundMs: Long,
  val attendedMs: Long,
  val glanceMs: Long,
  val passiveMs: Long,
  val usageOnlyMs: Long,
  val notInUseMs: Long,
  val unknownMs: Long,
  val source: String,
  val confidence: Float
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "dayStartMs" to dayStartMs,
    "foregroundMs" to foregroundMs,
    "attendedMs" to attendedMs,
    "glanceMs" to glanceMs,
    "passiveMs" to passiveMs,
    "usageOnlyMs" to usageOnlyMs,
    "notInUseMs" to notInUseMs,
    "unknownMs" to unknownMs,
    "source" to source,
    "confidence" to confidence
  )
}

/**
 * A small file-backed local store for data that has already been reduced to a user-facing
 * decision or aggregate. It never accepts audio/video/typed text, and notification display text
 * is deliberately not encoded by this store.
 *
 * The file is a versioned JSON envelope written through a sibling temporary file. Reads accept
 * the old top-level array format for migration, but malformed data is quarantined and treated as
 * empty instead of crashing a service or Expo call.
 */
class NativeHistoryStore(
  private val file: File,
  private val retention: HistoryRetention = HistoryRetention(),
  private val nowMs: () -> Long = { System.currentTimeMillis() }
) {
  private val lock = lockFor(file)
  private val gson: Gson = GsonBuilder()
    .registerTypeAdapter(NotificationRecord::class.java, NotificationRecordJsonAdapter())
    .create()
  private val notificationListType: Type = object : TypeToken<List<NotificationRecord>>() {}.type

  init {
    migrateLegacyNotificationFile()
  }

  fun notificationRecords(limit: Int = retention.notificationMaxRows): List<NotificationRecord> =
    synchronized(lock) { readEnvelope().notifications.take(limit.coerceIn(0, retention.notificationMaxRows)) }

  fun findNotification(id: String): NotificationRecord? =
    synchronized(lock) { readEnvelope().notifications.firstOrNull { it.id == id } }

  fun upsertNotification(record: NotificationRecord): Boolean = synchronized(lock) {
    val envelope = readEnvelope()
    val next = upsert<NotificationRecord>(envelope.notifications, record, NotificationRecord::id)
    writeEnvelope(envelope.copy(notifications = next.prune(retention.notificationMaxRows, retention.notificationRetentionMs, nowMs()) { it.postedAtMs }))
  }

  fun updateNotificationFeedback(id: String, feedback: NotificationFeedback): NotificationRecord? = synchronized(lock) {
    val envelope = readEnvelope()
    val index = envelope.notifications.indexOfFirst { it.id == id }
    if (index < 0) return@synchronized null
    val updated = envelope.notifications[index].withFeedback(feedback)
    val records = envelope.notifications.toMutableList().apply { set(index, updated) }
    if (!writeEnvelope(envelope.copy(notifications = records.prune(retention.notificationMaxRows, retention.notificationRetentionMs, nowMs()) { it.postedAtMs }))) {
      return@synchronized null
    }
    updated
  }

  fun ambientSamples(limit: Int = retention.ambientMaxRows): List<AmbientHistoryRecord> =
    synchronized(lock) { readEnvelope().ambient.take(limit.coerceIn(0, retention.ambientMaxRows)) }

  fun upsertAmbient(sample: AmbientHistoryRecord): Boolean = synchronized(lock) {
    val envelope = readEnvelope()
    val next = upsert<AmbientHistoryRecord>(envelope.ambient, sample, AmbientHistoryRecord::id)
    writeEnvelope(envelope.copy(ambient = next.prune(retention.ambientMaxRows, retention.ambientRetentionMs, nowMs()) { it.atMs }))
  }

  fun contextHistory(limit: Int = retention.contextMaxRows): List<ContextHistoryRecord> =
    synchronized(lock) { readEnvelope().context.take(limit.coerceIn(0, retention.contextMaxRows)) }

  fun upsertContext(record: ContextHistoryRecord): Boolean = synchronized(lock) {
    val envelope = readEnvelope()
    val next = upsert<ContextHistoryRecord>(envelope.context, record, ContextHistoryRecord::id)
    writeEnvelope(envelope.copy(context = next.prune(retention.contextMaxRows, retention.contextRetentionMs, nowMs()) { it.atMs }))
  }

  fun dndHistory(limit: Int = retention.contextMaxRows): List<DndHistoryRecord> =
    synchronized(lock) { readEnvelope().dnd.take(limit.coerceIn(0, retention.contextMaxRows)) }

  fun upsertDnd(record: DndHistoryRecord): Boolean = synchronized(lock) {
    val envelope = readEnvelope()
    val next = upsert<DndHistoryRecord>(envelope.dnd, record, DndHistoryRecord::id)
    writeEnvelope(envelope.copy(dnd = next.prune(retention.contextMaxRows, retention.contextRetentionMs, nowMs()) { it.atMs }))
  }

  fun attentionHistory(limit: Int = retention.attentionMaxRows): List<AttentionHistoryRecord> =
    synchronized(lock) { readEnvelope().attention.take(limit.coerceIn(0, retention.attentionMaxRows)) }

  fun upsertAttention(record: AttentionHistoryRecord): Boolean = synchronized(lock) {
    val envelope = readEnvelope()
    val next = upsert<AttentionHistoryRecord>(envelope.attention, record, AttentionHistoryRecord::id)
    writeEnvelope(envelope.copy(attention = next.prune(retention.attentionMaxRows, retention.attentionRetentionMs, nowMs()) { it.dayStartMs }))
  }

  fun clearNotifications(): Boolean = clear { it.copy(notifications = emptyList()) }

  fun deleteNotification(id: String): Boolean = clear {
    it.copy(notifications = it.notifications.filterNot { record -> record.id == id })
  }

  fun clearAmbient(): Boolean = clear { it.copy(ambient = emptyList()) }

  fun deleteAmbient(id: String): Boolean = clear {
    it.copy(ambient = it.ambient.filterNot { record -> record.id == id })
  }

  fun clearContext(): Boolean = clear { it.copy(context = emptyList()) }

  fun clearDnd(): Boolean = clear { it.copy(dnd = emptyList()) }

  fun deleteContext(id: String): Boolean = clear {
    it.copy(context = it.context.filterNot { record -> record.id == id })
  }

  fun deleteDnd(id: String): Boolean = clear {
    it.copy(dnd = it.dnd.filterNot { record -> record.id == id })
  }

  fun clearAttention(): Boolean = clear { it.copy(attention = emptyList()) }

  fun deleteAttention(id: String): Boolean = clear {
    it.copy(attention = it.attention.filterNot { record -> record.id == id })
  }

  fun clearAll(): Boolean = synchronized(lock) {
    runCatching {
      if (file.exists() && !file.delete()) return@runCatching false
      deleteIfPresent(temporaryFile())
      deleteCorruptSiblings()
      true
    }.getOrDefault(false)
  }

  fun recordAmbient(
    atMs: Long,
    db: Float,
    applied: Boolean,
    targetVolume: Int,
    ringVolume: Float?,
    reason: String,
    environment: String?,
    source: String,
    confidence: Float?
  ): Boolean {
    if (!db.isFinite()) return false
    return upsertAmbient(
      AmbientHistoryRecord(
        id = stableId("ambient", atMs),
        atMs = atMs,
        db = db,
        applied = applied,
        targetVolume = targetVolume,
        ringVolume = ringVolume?.takeIf { it.isFinite() },
        reason = reason.take(96),
        environment = environment?.take(64),
        source = source.take(64),
        confidence = confidence?.takeIf { it.isFinite() }
      )
    )
  }

  fun recordContext(result: InterruptibilityDecision, atMs: Long): Boolean = upsertContext(
    ContextHistoryRecord(
      id = stableId("context", atMs, result.level.name, result.shouldSuppress.toString()),
      atMs = atMs,
      level = result.level.name,
      score = result.score,
      shouldSuppress = result.shouldSuppress,
      reasonCodes = result.reasonCodes.distinct().map { it.take(96) }.take(32),
      signalStatus = result.contextStatus.mapValues { (_, value) -> value }
    )
  )

  /** Stores only an actual context transition; repeated UI refreshes do not create history noise. */
  fun recordContextIfChanged(result: InterruptibilityDecision, atMs: Long): Boolean {
    val latest = contextHistory(1).firstOrNull()
    if (latest != null &&
      latest.level == result.level.name &&
      latest.score == result.score &&
      latest.shouldSuppress == result.shouldSuppress &&
      latest.reasonCodes == result.reasonCodes.distinct().map { it.take(96) }.take(32)
    ) {
      return true
    }
    return recordContext(result, atMs)
  }

  fun recordDnd(requestEnabled: Boolean, result: DndResult, atMs: Long): Boolean = upsertDnd(
    DndHistoryRecord(
      id = stableId("dnd", atMs, requestEnabled.toString(), result.reason),
      atMs = atMs,
      enabled = requestEnabled,
      applied = result.applied,
      restored = result.restored,
      reason = result.reason.take(96),
      currentFilter = result.currentFilter,
      snapshotCaptured = result.snapshotCaptured,
      snapshotPresent = result.snapshotPresent
    )
  )

  fun recordAttention(
    dayStartMs: Long,
    foregroundMs: Long,
    classification: AttentionClassification,
    durationMs: Long
  ): Boolean {
    if (dayStartMs < 0L || durationMs <= 0L) return false
    val safeDuration = durationMs.coerceAtMost(MAX_INTERVAL_MS)
    return synchronized(lock) {
      val envelope = readEnvelope()
      val existing = envelope.attention.firstOrNull { it.dayStartMs == dayStartMs }
      val base = existing ?: AttentionHistoryRecord(
        id = stableId("attention-day", dayStartMs),
        dayStartMs = dayStartMs,
        foregroundMs = 0L,
        attendedMs = 0L,
        glanceMs = 0L,
        passiveMs = 0L,
        usageOnlyMs = 0L,
        notInUseMs = 0L,
        unknownMs = 0L,
        source = classification.source.take(64),
        confidence = classification.confidence.coerceIn(0f, 1f)
      )
      val updated = base.copy(
        foregroundMs = (base.foregroundMs + foregroundMs.coerceAtLeast(0L)).coerceAtMost(MAX_DAY_MS),
        attendedMs = base.attendedMs + if (classification.label.name == "ATTENDED") safeDuration else 0L,
        glanceMs = base.glanceMs + if (classification.label.name == "GLANCE") safeDuration else 0L,
        passiveMs = base.passiveMs + if (classification.label.name == "PASSIVE") safeDuration else 0L,
        usageOnlyMs = base.usageOnlyMs + if (classification.label.name == "USAGE_ONLY") safeDuration else 0L,
        notInUseMs = base.notInUseMs + if (classification.label.name == "NOT_IN_USE") safeDuration else 0L,
        unknownMs = base.unknownMs + if (classification.label.name == "UNKNOWN") safeDuration else 0L,
        source = classification.source.take(64),
        confidence = classification.confidence.coerceIn(0f, 1f)
      )
      val next = upsert<AttentionHistoryRecord>(envelope.attention, updated, AttentionHistoryRecord::id)
      writeEnvelope(envelope.copy(attention = next.prune(retention.attentionMaxRows, retention.attentionRetentionMs, nowMs()) { it.dayStartMs }))
    }
  }

  /**
   * Persists a usage-statistics aggregate without treating every UI refresh as new attention
   * time. The platform source is a rolling/aggregate window, so the largest observed bucket is
   * retained and exposed with its low-fidelity source label.
   */
  fun upsertAttentionSnapshot(
    dayStartMs: Long,
    foregroundMs: Long,
    classification: AttentionClassification
  ): Boolean {
    if (dayStartMs < 0L || foregroundMs < 0L) return false
    return synchronized(lock) {
      val envelope = readEnvelope()
      val existing = envelope.attention.firstOrNull { it.dayStartMs == dayStartMs }
      val observed = foregroundMs.coerceAtMost(MAX_DAY_MS)
      val base = existing ?: AttentionHistoryRecord(
        id = stableId("attention-day", dayStartMs),
        dayStartMs = dayStartMs,
        foregroundMs = 0L,
        attendedMs = 0L,
        glanceMs = 0L,
        passiveMs = 0L,
        usageOnlyMs = 0L,
        notInUseMs = 0L,
        unknownMs = 0L,
        source = classification.source.take(64),
        confidence = classification.confidence.coerceIn(0f, 1f)
      )
      val updated = base.copy(
        foregroundMs = maxOf(base.foregroundMs, observed),
        attendedMs = maxOf(base.attendedMs, if (classification.label.name == "ATTENDED") observed else 0L),
        glanceMs = maxOf(base.glanceMs, if (classification.label.name == "GLANCE") observed else 0L),
        passiveMs = maxOf(base.passiveMs, if (classification.label.name == "PASSIVE") observed else 0L),
        usageOnlyMs = maxOf(base.usageOnlyMs, if (classification.label.name == "USAGE_ONLY") observed else 0L),
        notInUseMs = maxOf(base.notInUseMs, if (classification.label.name == "NOT_IN_USE") observed else 0L),
        unknownMs = maxOf(base.unknownMs, if (classification.label.name == "UNKNOWN") observed else 0L),
        source = classification.source.take(64),
        confidence = classification.confidence.coerceIn(0f, 1f)
      )
      val next = upsert<AttentionHistoryRecord>(envelope.attention, updated, AttentionHistoryRecord::id)
      writeEnvelope(envelope.copy(attention = next.prune(retention.attentionMaxRows, retention.attentionRetentionMs, nowMs()) { it.dayStartMs }))
    }
  }

  private fun clear(transform: (HistoryEnvelope) -> HistoryEnvelope): Boolean = synchronized(lock) {
    writeEnvelope(transform(readEnvelope()))
  }

  private fun migrateLegacyNotificationFile() = synchronized(lock) {
    val legacy = File(file.parentFile, "attune_notification_records.json")
    if (file.exists() || !legacy.exists() || legacy.absolutePath == file.absolutePath) return@synchronized
    runCatching {
      val records = gson.fromJson<List<NotificationRecord>>(legacy.readText(), notificationListType)
      if (writeEnvelope(HistoryEnvelope(notifications = records).pruned(retention, nowMs()))) {
        legacy.delete()
      }
    }.onFailure {
      legacy.delete()
    }
  }

  private fun readEnvelope(): HistoryEnvelope {
    if (!file.exists()) return HistoryEnvelope()
    return runCatching {
      val raw = file.readText()
      val legacyNotifications = raw.trimStart().takeIf { it.startsWith("[") }
        ?.let { gson.fromJson<List<NotificationRecord>>(raw, notificationListType) }
      if (legacyNotifications != null) {
        val migrated = HistoryEnvelope(
          notifications = legacyNotifications
        ).pruned(retention, nowMs())
        // Rewrite legacy records immediately so display text from the old format is not left in
        // the long-term file after the first read.
        writeEnvelope(migrated)
        return@runCatching migrated
      }
      val envelope = gson.fromJson(raw, HistoryEnvelope::class.java)
        ?: throw IllegalArgumentException("empty_history")
      envelope.pruned(retention, nowMs())
    }.getOrElse {
      quarantineCorruptFile()
      HistoryEnvelope()
    }
  }

  private fun writeEnvelope(envelope: HistoryEnvelope): Boolean = runCatching {
    file.parentFile?.mkdirs()
    val json = gson.toJson(envelope)
    val temporary = temporaryFile()
    FileOutputStream(temporary).use { output ->
      output.write(json.toByteArray(StandardCharsets.UTF_8))
      output.fd.sync()
    }
    atomicReplace(temporary)
    true
  }.getOrElse {
    deleteIfPresent(temporaryFile())
    false
  }

  private fun quarantineCorruptFile() {
    runCatching {
      val corrupt = File(file.parentFile, "${file.name}.corrupt.${System.currentTimeMillis()}")
      if (!file.renameTo(corrupt)) file.delete()
      deleteCorruptSiblings(keepLatest = 2)
    }
  }

  private fun deleteCorruptSiblings(keepLatest: Int = 0) {
    val siblings = file.parentFile?.listFiles { candidate ->
      candidate.name.startsWith("${file.name}.corrupt.")
    }?.sortedByDescending { it.lastModified() }.orEmpty()
    siblings.drop(keepLatest).forEach { it.delete() }
  }

  private fun temporaryFile(): File = File(file.parentFile, "${file.name}.tmp")

  private fun atomicReplace(temporary: File) {
    // Android's file-system rename is atomic when replacing a file on supported app file systems.
    // Some JVM test hosts refuse to replace an existing destination, so retain a narrow fallback
    // for that host behavior rather than adding an API-level-sensitive java.nio dependency.
    if (temporary.renameTo(file)) return
    if (file.exists() && !file.delete()) throw IllegalStateException("history_replace_failed")
    if (!temporary.renameTo(file)) throw IllegalStateException("history_rename_failed")
  }

  private data class HistoryEnvelope(
    val notifications: List<NotificationRecord> = emptyList(),
    val ambient: List<AmbientHistoryRecord> = emptyList(),
    val context: List<ContextHistoryRecord> = emptyList(),
    val dnd: List<DndHistoryRecord> = emptyList(),
    val attention: List<AttentionHistoryRecord> = emptyList()
  ) {
    fun pruned(policy: HistoryRetention, now: Long): HistoryEnvelope = copy(
      notifications = notifications.prune(policy.notificationMaxRows, policy.notificationRetentionMs, now) { it.postedAtMs },
      ambient = ambient.prune(policy.ambientMaxRows, policy.ambientRetentionMs, now) { it.atMs },
      context = context.prune(policy.contextMaxRows, policy.contextRetentionMs, now) { it.atMs },
      dnd = dnd.prune(policy.contextMaxRows, policy.contextRetentionMs, now) { it.atMs },
      attention = attention.prune(policy.attentionMaxRows, policy.attentionRetentionMs, now) { it.dayStartMs }
    )
  }

  private companion object {
    const val SCHEMA_VERSION = 1
    const val MAX_INTERVAL_MS = 24L * 60 * 60 * 1000
    const val MAX_DAY_MS = 7L * 24 * 60 * 60 * 1000
    private val locks = mutableMapOf<String, Any>()

    fun lockFor(file: File): Any = synchronized(locks) {
      locks.getOrPut(file.absolutePath) { Any() }
    }
  }
}

private class NotificationRecordJsonAdapter : JsonSerializer<NotificationRecord>, JsonDeserializer<NotificationRecord> {
  override fun serialize(
    source: NotificationRecord,
    typeOfSrc: Type,
    context: JsonSerializationContext
  ): JsonElement = JsonObject().apply {
    addProperty("id", source.id)
    addProperty("packageName", source.packageName)
    addProperty("postedAtMs", source.postedAtMs)
    addProperty("senderTier", source.senderTier.name)
    addProperty("urgencyScore", source.urgencyScore)
    addProperty("baseScore", source.baseScore)
    addProperty("score", source.score)
    addProperty("feedback", source.feedback.name)
    addProperty("senderKey", source.senderKey)
    addProperty("conversationKey", source.conversationKey)
    addProperty("isMessage", source.isMessage)
    addProperty("adaptation", source.adaptation.name)
    addProperty("adaptationReason", source.adaptationReason)
    addProperty("hasOpenOriginalFallback", source.hasOpenOriginalFallback)
    add("reasonCodes", context.serialize(source.reasonCodes))
  }

  override fun deserialize(
    json: JsonElement,
    typeOfT: Type,
    context: JsonDeserializationContext
  ): NotificationRecord {
    val source = json.asJsonObject
    val reasonCodesType = object : TypeToken<List<String>>() {}.type
    return NotificationRecord(
      id = source.get("id").asString,
      packageName = source.get("packageName").asString,
      postedAtMs = source.get("postedAtMs").asLong,
      senderTier = enumOrDefault(source.get("senderTier")?.asString, SenderTier.UNKNOWN),
      urgencyScore = source.get("urgencyScore")?.asInt ?: 0,
      baseScore = source.get("baseScore")?.asInt ?: SenderTier.UNKNOWN.baseScore,
      score = source.get("score")?.asInt ?: 0,
      reasonCodes = source.get("reasonCodes")?.let { context.deserialize<List<String>>(it, reasonCodesType) }.orEmpty(),
      feedback = NotificationFeedback.fromWire(source.get("feedback")?.asString.orEmpty())
        ?: NotificationFeedback.NONE,
      senderKey = source.get("senderKey")?.asString?.takeIf { it.isNotBlank() },
      conversationKey = source.get("conversationKey")?.asString?.takeIf { it.isNotBlank() },
      isMessage = source.get("isMessage")?.asBoolean ?: false,
      adaptation = enumOrDefault(source.get("adaptation")?.asString, NotificationAdaptationAction.KEEP_ORIGINAL),
      adaptationReason = source.get("adaptationReason")?.asString ?: "not_evaluated",
      hasOpenOriginalFallback = source.get("hasOpenOriginalFallback")?.asBoolean ?: false
    )
  }

  private inline fun <reified T : Enum<T>> enumOrDefault(value: String?, fallback: T): T =
    runCatching { enumValueOf<T>(value.orEmpty()) }.getOrDefault(fallback)
}

private fun <T> upsert(items: List<T>, item: T, key: (T) -> String): List<T> {
  val identity = key(item)
  val index = items.indexOfFirst { key(it) == identity }
  return if (index < 0) listOf(item) + items else items.toMutableList().apply { set(index, item) }
}

private fun <T> List<T>.prune(
  maxRows: Int,
  retentionMs: Long,
  now: Long = System.currentTimeMillis(),
  timestamp: (T) -> Long
): List<T> {
  val cutoff = if (retentionMs == 0L) Long.MIN_VALUE else now - retentionMs
  return asSequence()
    .filter { timestamp(it) >= cutoff }
    .sortedByDescending(timestamp)
    .take(maxRows)
    .toList()
}

private fun stableId(prefix: String, vararg values: String): String {
  val input = (listOf(prefix) + values.toList()).joinToString("\u001f")
  val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(StandardCharsets.UTF_8))
  return digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte) }
}

private fun stableId(prefix: String, timestamp: Long, vararg values: String): String =
  stableId(prefix, timestamp.toString(), *values)

private fun deleteIfPresent(file: File) {
  if (file.exists()) file.delete()
}

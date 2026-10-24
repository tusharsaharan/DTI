package app.attune.attunenative.notification

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets

/**
 * Raw notification text is kept only in this app-private digest file or in the listener's
 * short-lived memory. The file lives below Context.filesDir, which Android protects from other
 * applications. Raw text is never put into NotificationRecord, event payloads, or logs.
 */
data class NotificationDigestEntry(
  val id: String,
  val packageName: String,
  val postedAtMs: Long,
  val title: String,
  val text: String,
  val score: Int,
  val reasonCodes: List<String>
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "postedAtMs" to postedAtMs,
    "title" to title,
    "text" to text,
    "score" to score,
    "reasonCodes" to reasonCodes
  )
}

interface NotificationDigestStore {
  fun upsert(entry: NotificationDigestEntry): Boolean
  fun all(limit: Int = 100): List<NotificationDigestEntry>
  fun remove(id: String)
  fun clear()
}

class InMemoryNotificationDigestStore : NotificationDigestStore {
  private val entries = ArrayDeque<NotificationDigestEntry>()

  @Synchronized
  override fun upsert(entry: NotificationDigestEntry): Boolean {
    val index = entries.indexOfFirst { it.id == entry.id }
    if (index >= 0) entries[index] = entry else entries.addFirst(entry)
    while (entries.size > 500) entries.removeLast()
    return true
  }

  @Synchronized
  override fun all(limit: Int): List<NotificationDigestEntry> =
    entries.take(limit.coerceIn(0, 500))

  @Synchronized
  override fun remove(id: String) {
    entries.removeAll { it.id == id }
  }

  @Synchronized
  override fun clear() {
    entries.clear()
  }
}

class FileNotificationDigestStore(
  private val file: File,
  private val maxEntries: Int = 500,
  private val retentionMs: Long = 7L * 24 * 60 * 60 * 1000,
  private val nowMs: () -> Long = { System.currentTimeMillis() }
) : NotificationDigestStore {
  private val lock = locks.getOrPut(file.absolutePath) { Any() }

  init {
    require(maxEntries >= 1)
    require(retentionMs >= 0L)
  }

  override fun upsert(entry: NotificationDigestEntry): Boolean = synchronized(lock) {
    runCatching {
      if (entry.id.isBlank()) return@runCatching false
      val bounded = entry.copy(
        id = entry.id.take(256),
        packageName = entry.packageName.take(256),
        title = entry.title.take(512),
        text = entry.text.take(4_096),
        reasonCodes = entry.reasonCodes.map { it.take(96) }.distinct().take(32)
      )
      val next = readAll().toMutableList()
      val index = next.indexOfFirst { it.id == bounded.id }
      if (index >= 0) next[index] = bounded else next.add(0, bounded)
      writeAll(next.prune())
      true
    }.getOrDefault(false)
  }

  override fun all(limit: Int): List<NotificationDigestEntry> = synchronized(lock) {
    readAll().take(limit.coerceIn(0, maxEntries))
  }

  override fun remove(id: String) = synchronized(lock) {
    val next = readAll().filterNot { it.id == id }
    if (next.isEmpty()) {
      if (file.exists()) file.delete()
    } else {
      writeAll(next.prune())
    }
  }

  override fun clear() {
    synchronized(lock) {
      if (file.exists()) file.delete()
      File(file.parentFile, "${file.name}.tmp").delete()
      file.parentFile?.listFiles { candidate -> candidate.name.startsWith("${file.name}.corrupt.") }
        ?.forEach { it.delete() }
    }
  }

  private fun readAll(): List<NotificationDigestEntry> {
    if (!file.exists()) return emptyList()
    return runCatching {
      val raw = file.readText()
      val array = if (raw.trimStart().startsWith("[")) {
        JSONArray(raw)
      } else {
        JSONObject(raw).optJSONArray("entries") ?: JSONArray()
      }
      buildList {
        for (index in 0 until array.length()) {
          runCatching {
            val item = array.getJSONObject(index)
            add(
              NotificationDigestEntry(
                id = item.getString("id"),
                packageName = item.getString("packageName"),
                postedAtMs = item.getLong("postedAtMs"),
                title = item.optString("title"),
                text = item.optString("text"),
                score = item.optInt("score"),
                reasonCodes = item.optJSONArray("reasonCodes")?.toStringList() ?: emptyList()
              )
            )
          }
        }
      }.prune()
    }.getOrElse {
      quarantineCorruptFile()
      emptyList()
    }
  }

  private fun writeAll(entries: List<NotificationDigestEntry>) {
    file.parentFile?.mkdirs()
    val array = JSONArray()
    entries.prune().forEach { entry ->
      array.put(
        JSONObject().apply {
          put("id", entry.id)
          put("packageName", entry.packageName)
          put("postedAtMs", entry.postedAtMs)
          put("title", entry.title)
          put("text", entry.text)
          put("score", entry.score)
          put("reasonCodes", JSONArray().apply { entry.reasonCodes.forEach { put(it) } })
        }
      )
    }
    val temporary = File(file.parentFile, "${file.name}.tmp")
    val envelope = JSONObject().apply {
      put("version", 1)
      put("entries", array)
    }
    FileOutputStream(temporary).use { output ->
      output.write(envelope.toString().toByteArray(StandardCharsets.UTF_8))
      output.fd.sync()
    }
    if (!temporary.renameTo(file)) {
      if (file.exists() && !file.delete()) throw IllegalStateException("digest_replace_failed")
      if (!temporary.renameTo(file)) throw IllegalStateException("digest_rename_failed")
    }
  }

  private fun List<NotificationDigestEntry>.prune(): List<NotificationDigestEntry> {
    val cutoff = if (retentionMs == 0L) Long.MIN_VALUE else nowMs() - retentionMs
    return asSequence()
      .filter { it.postedAtMs >= cutoff }
      .sortedByDescending { it.postedAtMs }
      .take(maxEntries.coerceAtLeast(1))
      .toList()
  }

  private fun quarantineCorruptFile() {
    runCatching {
      val corrupt = File(file.parentFile, "${file.name}.corrupt.${System.currentTimeMillis()}")
      if (!file.renameTo(corrupt)) file.delete()
      file.parentFile?.listFiles { candidate -> candidate.name.startsWith("${file.name}.corrupt.") }
        ?.sortedByDescending { it.lastModified() }
        ?.drop(2)
        ?.forEach { it.delete() }
    }
  }

  private fun JSONArray.toStringList(): List<String> = buildList {
    for (index in 0 until length()) add(getString(index))
  }

  companion object {
    private val locks = mutableMapOf<String, Any>()
  }
}

internal fun ParsedNotification.toDigestEntry(
  id: String,
  packageName: String,
  postedAtMs: Long,
  score: NotificationScore
): NotificationDigestEntry = NotificationDigestEntry(
  id = id,
  packageName = packageName,
  postedAtMs = postedAtMs,
  title = displayTitle,
  text = displayText,
  score = score.points,
  reasonCodes = score.reasonCodes
)

package app.attune.attunenative.history

import app.attune.attunenative.notification.NotificationRecord
import app.attune.attunenative.notification.SenderTier
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeHistoryStoreTest {
  @Test
  fun retentionPrunesByAgeAndRowLimit() {
    val file = tempFile()
    var now = 1_000L
    val store = NativeHistoryStore(
      file = file,
      retention = HistoryRetention(
        ambientMaxRows = 2,
        ambientRetentionMs = 100L
      ),
      nowMs = { now }
    )

    try {
      assertTrue(store.recordAmbient(850L, 45f, false, 3, null, "old", null, "microphone", null))
      assertTrue(store.recordAmbient(950L, 55f, true, 5, 0.4f, "newer", null, "microphone", null))
      assertTrue(store.recordAmbient(1_000L, 65f, true, 7, 0.6f, "newest", null, "microphone", null))

      assertEquals(listOf(1_000L, 950L), store.ambientSamples().map { it.atMs })
      now = 1_100L
      assertEquals(listOf(1_000L), store.ambientSamples().map { it.atMs })
    } finally {
      deleteTree(file)
    }
  }

  @Test
  fun malformedHistoryReadsAsEmptyAndCanRecover() {
    val file = tempFile()
    try {
      file.writeText("{ definitely not valid history")

      val store = NativeHistoryStore(file, nowMs = { 10L })
      assertTrue(store.ambientSamples().isEmpty())
      assertTrue(store.recordAmbient(10L, 42f, false, 2, null, "within_hysteresis", null, "microphone", null))
      assertEquals(1, store.ambientSamples().size)
      assertFalse(file.readText().contains("definitely not valid"))
    } finally {
      deleteTree(file)
    }
  }

  @Test
  fun clearRemovesOnlyRequestedCategoryAndClearAllRemovesStore() {
    val file = tempFile()
    try {
      val store = NativeHistoryStore(file, nowMs = { 10L })
      store.upsertNotification(notification("notification-1", 10L))
      store.recordAmbient(10L, 42f, false, 2, null, "within_hysteresis", null, "microphone", null)
      store.upsertContext(
        ContextHistoryRecord("context-1", 10L, "LIMITED", 50, false, listOf("still"), emptyMap())
      )

      assertTrue(store.clearAmbient())
      assertTrue(store.ambientSamples().isEmpty())
      assertEquals(1, store.notificationRecords().size)
      assertEquals(1, store.contextHistory().size)
      assertTrue(store.deleteNotification("notification-1"))
      assertTrue(store.notificationRecords().isEmpty())
      assertTrue(store.clearAll())
      assertTrue(store.notificationRecords().isEmpty())
      assertFalse(file.exists())
    } finally {
      deleteTree(file)
    }
  }

  @Test
  fun notificationUpsertDeduplicatesAcrossInstancesAndNeverPersistsDisplayText() {
    val file = tempFile()
    try {
      val first = NativeHistoryStore(file, nowMs = { 20L })
      first.upsertNotification(notification("same", 10L).copy(text = "private notification text"))

      val second = NativeHistoryStore(file, nowMs = { 20L })
      second.upsertNotification(notification("same", 20L).copy(score = 80))

      val restored = NativeHistoryStore(file, nowMs = { 20L }).notificationRecords()
      assertEquals(1, restored.size)
      assertEquals(20L, restored.single().postedAtMs)
      assertEquals(80, restored.single().score)
      assertNull(restored.single().text)
      assertFalse(file.readText().contains("private notification text"))
    } finally {
      deleteTree(file)
    }
  }

  private fun notification(id: String, postedAtMs: Long): NotificationRecord = NotificationRecord(
    id = id,
    packageName = "com.example.chat",
    postedAtMs = postedAtMs,
    senderTier = SenderTier.UNKNOWN,
    urgencyScore = 0,
    baseScore = SenderTier.UNKNOWN.baseScore,
    score = SenderTier.UNKNOWN.baseScore,
    reasonCodes = listOf("sender_unknown"),
    sender = "Asha",
    conversation = "Weekend plans",
    text = "display text"
  )

  private fun tempFile(): File {
    val file = File.createTempFile("attune-history", ".json")
    file.delete()
    return file
  }

  private fun deleteTree(file: File) {
    file.delete()
    file.parentFile?.listFiles { candidate ->
      candidate.name.startsWith("${file.name}.tmp") || candidate.name.startsWith("${file.name}.corrupt.")
    }?.forEach { it.delete() }
  }
}

package app.attune.attunenative.dnd

import android.app.NotificationManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun defaultFakeSnapshot() = DndPolicySnapshot(
  interruptionFilter = NotificationManager.INTERRUPTION_FILTER_ALL,
  policy = DndNotificationPolicy(0, 0, 0),
  capturedAtMs = 0L
)

class DndPolicyTest {
  @Test
  fun deniedAccessDoesNotReadOrWritePolicy() {
    val backend = FakeBackend(hasAccess = false)
    val store = FakeStore()

    val result = DndPolicyCoordinator(backend, store, nowMs = { 10L }).apply(
      DndRequest(enabled = true)
    )

    assertFalse(result.applied)
    assertFalse(result.hasAccess)
    assertEquals("policy_access_required", result.reason)
    assertTrue(backend.writes.isEmpty())
    assertNull(store.snapshot)
  }

  @Test
  fun enablingCapturesExactStateAndDisablingRestoresIt() {
    val original = snapshot(
      filter = NotificationManager.INTERRUPTION_FILTER_ALL,
      categories = NotificationManager.Policy.PRIORITY_CATEGORY_EVENTS,
      calls = NotificationManager.Policy.PRIORITY_SENDERS_CONTACTS,
      messages = NotificationManager.Policy.PRIORITY_SENDERS_ANY,
      suppressedVisualEffects = 42,
      conversations = 7
    )
    val backend = FakeBackend(initial = original)
    val store = FakeStore()
    val coordinator = DndPolicyCoordinator(backend, store, nowMs = { 123L })

    val enabled = coordinator.apply(DndRequest(enabled = true))

    assertTrue(enabled.applied)
    assertTrue(enabled.snapshotCaptured)
    assertEquals(original.copy(capturedAtMs = 123L), store.snapshot)
    assertEquals(NotificationManager.INTERRUPTION_FILTER_PRIORITY, backend.state.interruptionFilter)
    assertTrue(
      (backend.state.policy.priorityCategories and
        NotificationManager.Policy.PRIORITY_CATEGORY_EVENTS) != 0
    )
    assertEquals(NotificationManager.Policy.PRIORITY_SENDERS_STARRED, backend.state.policy.priorityCallSenders)
    assertEquals(NotificationManager.Policy.PRIORITY_SENDERS_STARRED, backend.state.policy.priorityMessageSenders)

    val disabled = coordinator.apply(DndRequest(enabled = false))

    assertTrue(disabled.applied)
    assertTrue(disabled.restored)
    assertEquals("restored", disabled.reason)
    assertEquals(original, backend.state)
    assertNull(store.snapshot)
  }

  @Test
  fun disablingWithoutAnAttuneSnapshotLeavesUserDndUntouched() {
    val original = snapshot(filter = NotificationManager.INTERRUPTION_FILTER_ALARMS)
    val backend = FakeBackend(initial = original)
    val store = FakeStore()

    val result = DndPolicyCoordinator(backend, store).apply(DndRequest(enabled = false))

    assertFalse(result.applied)
    assertEquals("not_active_no_snapshot", result.reason)
    assertTrue(backend.writes.isEmpty())
    assertEquals(original, backend.state)
  }

  @Test
  fun partialWriteRollsBackAndReleasesNewSnapshot() {
    val original = snapshot(filter = NotificationManager.INTERRUPTION_FILTER_ALL)
    val backend = FakeBackend(initial = original, failNextFilterWrite = true)
    val store = FakeStore()

    val result = DndPolicyCoordinator(backend, store).apply(DndRequest(enabled = true))

    assertFalse(result.applied)
    assertEquals("policy_write_rejected", result.reason)
    assertTrue(result.rollbackAttempted)
    assertEquals(original, backend.state)
    assertNull(store.snapshot)
  }

  @Test
  fun policyMapperOnlyChangesAttuneManagedCategories() {
    val current = DndNotificationPolicy(
      priorityCategories = NotificationManager.Policy.PRIORITY_CATEGORY_EVENTS or
        NotificationManager.Policy.PRIORITY_CATEGORY_CALLS or
        NotificationManager.Policy.PRIORITY_CATEGORY_REPEAT_CALLERS,
      priorityCallSenders = NotificationManager.Policy.PRIORITY_SENDERS_CONTACTS,
      priorityMessageSenders = NotificationManager.Policy.PRIORITY_SENDERS_ANY,
      suppressedVisualEffects = 9,
      priorityConversationSenders = 4
    )

    val mapped = FocusPolicyMapper.forRequest(
      current,
      DndRequest(enabled = true, allowPrioritySenders = false, allowRepeatCallers = false)
    )

    assertEquals(NotificationManager.Policy.PRIORITY_CATEGORY_EVENTS, mapped.priorityCategories)
    assertEquals(NotificationManager.Policy.PRIORITY_SENDERS_ANY, mapped.priorityCallSenders)
    assertEquals(NotificationManager.Policy.PRIORITY_SENDERS_ANY, mapped.priorityMessageSenders)
    assertEquals(current.suppressedVisualEffects, mapped.suppressedVisualEffects)
    assertEquals(current.priorityConversationSenders, mapped.priorityConversationSenders)
  }

  @Test
  fun android15ModeExplainsPlatformManagedAutomaticZenRuleBehavior() {
    assertEquals(
      DndPlatform.PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE,
      DndPlatform.modeForApi(35)
    )
    assertTrue(
      DndPlatform.limitationsForApi(35).any { it.contains("AutomaticZenRule") }
    )
    assertEquals(DndPlatform.GLOBAL_INTERRUPTION_FILTER, DndPlatform.modeFor(35, 34))
    assertEquals(
      DndPlatform.PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE,
      DndPlatform.modeFor(35, 35)
    )
    assertTrue(DndPlatform.limitationsForApi(34).isEmpty())
  }

  private fun snapshot(
    filter: Int,
    categories: Int = 0,
    calls: Int = NotificationManager.Policy.PRIORITY_SENDERS_ANY,
    messages: Int = NotificationManager.Policy.PRIORITY_SENDERS_ANY,
    suppressedVisualEffects: Int = 0,
    conversations: Int = 0
  ) = DndPolicySnapshot(
    interruptionFilter = filter,
    policy = DndNotificationPolicy(
      priorityCategories = categories,
      priorityCallSenders = calls,
      priorityMessageSenders = messages,
      suppressedVisualEffects = suppressedVisualEffects,
      priorityConversationSenders = conversations
    ),
    capturedAtMs = 1L
  )

  private class FakeStore(var snapshot: DndPolicySnapshot? = null) : DndPolicySnapshotStore {
    override fun load(): DndPolicySnapshot? = snapshot
    override fun save(snapshot: DndPolicySnapshot): Boolean {
      this.snapshot = snapshot
      return true
    }
    override fun clear(): Boolean {
      snapshot = null
      return true
    }
  }

  private class FakeBackend(
    private val initial: DndPolicySnapshot = defaultFakeSnapshot(),
    private val hasAccess: Boolean = true,
    private var failNextFilterWrite: Boolean = false
  ) : DndPolicyBackend {
    override val automaticZenRuleMode: String = DndPlatform.GLOBAL_INTERRUPTION_FILTER
    var state: DndPolicySnapshot = initial
    val writes = mutableListOf<String>()

    override fun hasPolicyAccess(): Boolean = hasAccess
    override fun readCurrentState(): DndPolicySnapshot = state
    override fun writePolicy(policy: DndNotificationPolicy) {
      writes += "policy"
      state = state.copy(policy = policy)
    }
    override fun writeInterruptionFilter(filter: Int) {
      writes += "filter"
      if (failNextFilterWrite) {
        failNextFilterWrite = false
        throw IllegalStateException("simulated filter write failure")
      }
      state = state.copy(interruptionFilter = filter)
    }
    override fun currentFilter(): Int = state.interruptionFilter
  }
}

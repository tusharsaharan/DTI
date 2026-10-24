package app.attune.attunenative.dnd

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

data class DndRequest(
  val enabled: Boolean,
  val allowPrioritySenders: Boolean = true,
  val allowRepeatCallers: Boolean = true
)

/** A platform-independent copy of NotificationManager.Policy for safe persistence and tests. */
data class DndNotificationPolicy(
  val priorityCategories: Int,
  val priorityCallSenders: Int,
  val priorityMessageSenders: Int,
  val suppressedVisualEffects: Int = 0,
  val priorityConversationSenders: Int = 0
)

/** The exact filter and policy that existed before Attune started managing DND. */
data class DndPolicySnapshot(
  val interruptionFilter: Int,
  val policy: DndNotificationPolicy,
  val capturedAtMs: Long
)

data class DndResult(
  val applied: Boolean,
  val hasAccess: Boolean,
  val currentFilter: Int?,
  val reason: String,
  val restored: Boolean = false,
  val snapshotCaptured: Boolean = false,
  val snapshotPresent: Boolean = false,
  val rollbackAttempted: Boolean = false,
  val automaticZenRuleMode: String = DndPlatform.modeForApi(Build.VERSION.SDK_INT),
  val limitations: List<String> = DndPlatform.limitationsForApi(Build.VERSION.SDK_INT)
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "applied" to applied,
    "hasAccess" to hasAccess,
    "currentFilter" to currentFilter,
    "reason" to reason,
    "restored" to restored,
    "snapshotCaptured" to snapshotCaptured,
    "snapshotPresent" to snapshotPresent,
    "rollbackAttempted" to rollbackAttempted,
    "automaticZenRuleMode" to automaticZenRuleMode,
    "limitations" to limitations,
    "status" to mapOf(
      "ownedState" to snapshotPresent,
      "accessRequired" to !hasAccess,
      "platformMode" to automaticZenRuleMode
    )
  )
}

interface DndPolicyController {
  fun hasPolicyAccess(): Boolean
  fun settingsIntent(): Intent
  fun currentFilter(): Int?
  fun apply(request: DndRequest): DndResult
}

/** Storage is injectable so snapshot ownership can be tested without Android framework state. */
interface DndPolicySnapshotStore {
  fun load(): DndPolicySnapshot?
  fun save(snapshot: DndPolicySnapshot): Boolean
  fun clear(): Boolean
}

/** The write boundary is injectable so denied access and partial-write behavior are testable. */
interface DndPolicyBackend {
  val automaticZenRuleMode: String

  fun hasPolicyAccess(): Boolean
  fun readCurrentState(): DndPolicySnapshot?
  fun writePolicy(policy: DndNotificationPolicy)
  fun writeInterruptionFilter(filter: Int)
  fun currentFilter(): Int?
}

/**
 * Coordinates one owned DND session. It never disables a pre-existing user DND state when
 * Attune has no snapshot proving that Attune enabled it.
 */
class DndPolicyCoordinator(
  private val backend: DndPolicyBackend,
  private val store: DndPolicySnapshotStore,
  private val nowMs: () -> Long = { System.currentTimeMillis() }
) {
  fun apply(request: DndRequest): DndResult {
    val hasAccess = runCatching { backend.hasPolicyAccess() }.getOrDefault(false)
    if (!hasAccess) {
      return result(
        applied = false,
        hasAccess = false,
        currentFilter = safeCurrentFilter(),
        reason = "policy_access_required",
        snapshotPresent = safeLoad() != null
      )
    }

    return if (request.enabled) enable(request) else disable()
  }

  private fun enable(request: DndRequest): DndResult {
    val existingSnapshot = safeLoad()
    val prior = existingSnapshot ?: runCatching { backend.readCurrentState() }.getOrNull()
    if (prior == null) {
      return result(
        applied = false,
        hasAccess = true,
        currentFilter = safeCurrentFilter(),
        reason = "policy_snapshot_unavailable"
      )
    }

    val snapshotCaptured = existingSnapshot == null
    if (snapshotCaptured && !runCatching {
        store.save(prior.copy(capturedAtMs = nowMs()))
      }.getOrDefault(false)
    ) {
      return result(
        applied = false,
        hasAccess = true,
        currentFilter = safeCurrentFilter(),
        reason = "policy_snapshot_persist_failed"
      )
    }

    val desiredPolicy = FocusPolicyMapper.forRequest(prior.policy, request)
    return try {
      // The policy is written before the priority filter so a partial failure never leaves an
      // active priority filter with an unrelated policy if rollback succeeds.
      backend.writePolicy(desiredPolicy)
      backend.writeInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
      result(
        applied = true,
        hasAccess = true,
        currentFilter = safeCurrentFilter(),
        reason = if (backend.automaticZenRuleMode == DndPlatform.PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE) {
          "applied_platform_managed_automatic_zen_rule"
        } else {
          "applied"
        },
        snapshotCaptured = snapshotCaptured,
        snapshotPresent = true
      )
    } catch (_: Throwable) {
      val rollbackAttempted = true
      val rollbackSucceeded = runCatching {
        restore(prior)
        true
      }.getOrDefault(false)
      if (snapshotCaptured && rollbackSucceeded) {
        runCatching { store.clear() }
      }
      result(
        applied = false,
        hasAccess = runCatching { backend.hasPolicyAccess() }.getOrDefault(false),
        currentFilter = safeCurrentFilter(),
        reason = "policy_write_rejected",
        snapshotPresent = safeLoad() != null,
        rollbackAttempted = rollbackAttempted
      )
    }
  }

  private fun disable(): DndResult {
    val snapshot = safeLoad()
      ?: return result(
        applied = false,
        hasAccess = true,
        currentFilter = safeCurrentFilter(),
        reason = "not_active_no_snapshot"
      )

    return try {
      restore(snapshot)
      val cleared = runCatching { store.clear() }.getOrDefault(false)
      result(
        applied = true,
        hasAccess = true,
        currentFilter = safeCurrentFilter(),
        reason = when {
          !cleared -> "restored_snapshot_but_clear_failed"
          backend.automaticZenRuleMode == DndPlatform.PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE ->
            "restored_platform_managed_automatic_zen_rule"
          else -> "restored"
        },
        restored = true,
        snapshotPresent = !cleared
      )
    } catch (_: Throwable) {
      result(
        applied = false,
        hasAccess = runCatching { backend.hasPolicyAccess() }.getOrDefault(false),
        currentFilter = safeCurrentFilter(),
        reason = "policy_restore_rejected",
        snapshotPresent = true
      )
    }
  }

  private fun restore(snapshot: DndPolicySnapshot) {
    backend.writePolicy(snapshot.policy)
    backend.writeInterruptionFilter(snapshot.interruptionFilter)
  }

  private fun safeLoad(): DndPolicySnapshot? = runCatching { store.load() }.getOrNull()

  private fun safeCurrentFilter(): Int? = runCatching { backend.currentFilter() }.getOrNull()

  private fun result(
    applied: Boolean,
    hasAccess: Boolean,
    currentFilter: Int?,
    reason: String,
    restored: Boolean = false,
    snapshotCaptured: Boolean = false,
    snapshotPresent: Boolean = false,
    rollbackAttempted: Boolean = false
  ): DndResult = DndResult(
    applied = applied,
    hasAccess = hasAccess,
    currentFilter = currentFilter,
    reason = reason,
    restored = restored,
    snapshotCaptured = snapshotCaptured,
    snapshotPresent = snapshotPresent,
    rollbackAttempted = rollbackAttempted,
    automaticZenRuleMode = backend.automaticZenRuleMode,
    limitations = DndPlatform.limitationsForMode(backend.automaticZenRuleMode)
  )
}

object FocusPolicyMapper {
  fun forRequest(current: DndNotificationPolicy, request: DndRequest): DndNotificationPolicy {
    val managedCategories = NotificationManager.Policy.PRIORITY_CATEGORY_CALLS or
      NotificationManager.Policy.PRIORITY_CATEGORY_MESSAGES or
      NotificationManager.Policy.PRIORITY_CATEGORY_REPEAT_CALLERS
    val untouchedCategories = current.priorityCategories and managedCategories.inv()
    val requestedCategories = (if (request.allowPrioritySenders) {
      NotificationManager.Policy.PRIORITY_CATEGORY_CALLS or
        NotificationManager.Policy.PRIORITY_CATEGORY_MESSAGES
    } else {
      0
    }) or if (request.allowRepeatCallers) {
      NotificationManager.Policy.PRIORITY_CATEGORY_REPEAT_CALLERS
    } else {
      0
    }

    val senderMode = if (request.allowPrioritySenders) {
      NotificationManager.Policy.PRIORITY_SENDERS_STARRED
    } else {
      NotificationManager.Policy.PRIORITY_SENDERS_ANY
    }
    return current.copy(
      priorityCategories = untouchedCategories or requestedCategories,
      priorityCallSenders = senderMode,
      priorityMessageSenders = senderMode
    )
  }
}

object DndPlatform {
  const val GLOBAL_INTERRUPTION_FILTER = "global_interruption_filter"
  const val PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE = "platform_managed_automatic_zen_rule"

  fun modeForApi(apiLevel: Int): String = modeFor(apiLevel, apiLevel)

  fun modeFor(apiLevel: Int, targetSdk: Int): String = if (apiLevel >= 35 && targetSdk >= 35) {
    PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE
  } else {
    GLOBAL_INTERRUPTION_FILTER
  }

  fun limitationsForApi(apiLevel: Int): List<String> = limitationsForMode(modeForApi(apiLevel))

  fun limitationsForMode(mode: String): List<String> = if (
    mode == PLATFORM_MANAGED_AUTOMATIC_ZEN_RULE
  ) {
    listOf(
      "Android 15+ maps setNotificationPolicy and setInterruptionFilter to an app-owned AutomaticZenRule.",
      "Attune does not claim ownership of or modify the user's other automatic rules."
    )
  } else {
    emptyList()
  }
}

private class AndroidDndPolicyBackend(
  private val manager: NotificationManager,
  targetSdk: Int
) : DndPolicyBackend {
  override val automaticZenRuleMode: String = DndPlatform.modeFor(Build.VERSION.SDK_INT, targetSdk)

  override fun hasPolicyAccess(): Boolean = manager.isNotificationPolicyAccessGranted

  override fun readCurrentState(): DndPolicySnapshot {
    val policy = manager.notificationPolicy
    return DndPolicySnapshot(
      interruptionFilter = manager.currentInterruptionFilter,
      policy = policy.toDndPolicy(),
      capturedAtMs = System.currentTimeMillis()
    )
  }

  override fun writePolicy(policy: DndNotificationPolicy) {
    manager.notificationPolicy = policy.toAndroidPolicy()
  }

  override fun writeInterruptionFilter(filter: Int) {
    manager.setInterruptionFilter(filter)
  }

  override fun currentFilter(): Int = manager.currentInterruptionFilter
}

private fun NotificationManager.Policy.toDndPolicy(): DndNotificationPolicy = DndNotificationPolicy(
  priorityCategories = priorityCategories,
  priorityCallSenders = priorityCallSenders,
  priorityMessageSenders = priorityMessageSenders,
  suppressedVisualEffects = if (Build.VERSION.SDK_INT >= 24) suppressedVisualEffects else 0,
  priorityConversationSenders = if (Build.VERSION.SDK_INT >= 30) priorityConversationSenders else 0
)

private fun DndNotificationPolicy.toAndroidPolicy(): NotificationManager.Policy = when {
  Build.VERSION.SDK_INT >= 30 -> NotificationManager.Policy(
    priorityCategories,
    priorityCallSenders,
    priorityMessageSenders,
    suppressedVisualEffects,
    priorityConversationSenders
  )
  Build.VERSION.SDK_INT >= 24 -> NotificationManager.Policy(
    priorityCategories,
    priorityCallSenders,
    priorityMessageSenders,
    suppressedVisualEffects
  )
  else -> NotificationManager.Policy(
    priorityCategories,
    priorityCallSenders,
    priorityMessageSenders
  )
}

private class SharedPreferencesDndPolicySnapshotStore(context: Context) : DndPolicySnapshotStore {
  private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  override fun load(): DndPolicySnapshot? = runCatching {
    if (!preferences.contains(KEY_FILTER)) return null
    DndPolicySnapshot(
      interruptionFilter = preferences.getInt(KEY_FILTER, NotificationManager.INTERRUPTION_FILTER_UNKNOWN),
      policy = DndNotificationPolicy(
        priorityCategories = preferences.getInt(KEY_CATEGORIES, 0),
        priorityCallSenders = preferences.getInt(KEY_CALL_SENDERS, NotificationManager.Policy.PRIORITY_SENDERS_ANY),
        priorityMessageSenders = preferences.getInt(KEY_MESSAGE_SENDERS, NotificationManager.Policy.PRIORITY_SENDERS_ANY),
        suppressedVisualEffects = preferences.getInt(KEY_SUPPRESSED_EFFECTS, 0),
        priorityConversationSenders = preferences.getInt(KEY_CONVERSATION_SENDERS, 0)
      ),
      capturedAtMs = preferences.getLong(KEY_CAPTURED_AT, 0L)
    )
  }.getOrNull()

  override fun save(snapshot: DndPolicySnapshot): Boolean = runCatching {
    preferences.edit()
      .putInt(KEY_FILTER, snapshot.interruptionFilter)
      .putInt(KEY_CATEGORIES, snapshot.policy.priorityCategories)
      .putInt(KEY_CALL_SENDERS, snapshot.policy.priorityCallSenders)
      .putInt(KEY_MESSAGE_SENDERS, snapshot.policy.priorityMessageSenders)
      .putInt(KEY_SUPPRESSED_EFFECTS, snapshot.policy.suppressedVisualEffects)
      .putInt(KEY_CONVERSATION_SENDERS, snapshot.policy.priorityConversationSenders)
      .putLong(KEY_CAPTURED_AT, snapshot.capturedAtMs)
      .commit()
  }.getOrDefault(false)

  override fun clear(): Boolean = runCatching {
    preferences.edit()
      .remove(KEY_FILTER)
      .remove(KEY_CATEGORIES)
      .remove(KEY_CALL_SENDERS)
      .remove(KEY_MESSAGE_SENDERS)
      .remove(KEY_SUPPRESSED_EFFECTS)
      .remove(KEY_CONVERSATION_SENDERS)
      .remove(KEY_CAPTURED_AT)
      .commit()
  }.getOrDefault(false)

  private companion object {
    const val PREFERENCES_NAME = "attune_dnd_policy_snapshot"
    const val KEY_FILTER = "interruption_filter"
    const val KEY_CATEGORIES = "priority_categories"
    const val KEY_CALL_SENDERS = "priority_call_senders"
    const val KEY_MESSAGE_SENDERS = "priority_message_senders"
    const val KEY_SUPPRESSED_EFFECTS = "suppressed_visual_effects"
    const val KEY_CONVERSATION_SENDERS = "priority_conversation_senders"
    const val KEY_CAPTURED_AT = "captured_at_ms"
  }
}

class AndroidDndPolicyController(private val context: Context) : DndPolicyController {
  private val manager: NotificationManager?
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

  override fun hasPolicyAccess(): Boolean = runCatching {
    manager?.isNotificationPolicyAccessGranted == true
  }.getOrDefault(false)

  override fun settingsIntent(): Intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)

  override fun currentFilter(): Int? = runCatching { manager?.currentInterruptionFilter }.getOrNull()

  override fun apply(request: DndRequest): DndResult {
    val notificationManager = manager
      ?: return DndResult(false, false, null, "notification_manager_unavailable")
    return DndPolicyCoordinator(
      backend = AndroidDndPolicyBackend(
        manager = notificationManager,
        targetSdk = context.applicationInfo.targetSdkVersion
      ),
      store = SharedPreferencesDndPolicySnapshotStore(context)
    ).apply(request)
  }
}

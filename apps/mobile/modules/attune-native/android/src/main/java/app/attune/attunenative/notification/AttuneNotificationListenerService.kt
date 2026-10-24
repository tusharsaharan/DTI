package app.attune.attunenative.notification

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import app.attune.attunenative.AttuneEventHub

object NotificationListenerRuntime {
  @Volatile var connected: Boolean = false
}

private const val ATTUNE_PRIORITY_CHANNEL_ID = "attune_priority"
private const val ATTUNE_REPOST_MARKER = "app.attune.attunenative.notification.ATTUNE_REPOST"

class AttuneNotificationListenerService : NotificationListenerService() {
  private val scorer = NotificationScorer()
  private val store by lazy { FileNotificationRecordStore(filesDir.resolve("attune_history.json")) }
  private val digestStore by lazy { FileNotificationDigestStore(filesDir.resolve("attune_notification_digest.json")) }

  override fun onListenerConnected() {
    NotificationListenerRuntime.connected = true
    AttuneEventHub.publish("onNativeStatusChanged", mapOf("notificationListenerConnected" to true))
  }

  override fun onListenerDisconnected() {
    NotificationListenerRuntime.connected = false
    AttuneEventHub.publish("onNativeStatusChanged", mapOf("notificationListenerConnected" to false))
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!NotificationAccessChecker.isEnabled(this)) return

    val notification = sbn.notification ?: return
    if (isSelfNotification(sbn, notification)) return

    if (!NotificationAdaptationSettings.isEnabled(this)) return

    val parsed = NotificationParser.parse(notification, sbn.packageName)
    val id = stableNotificationId(sbn.key)
    val history = store.all(500)
    val previous = store.find(id)
    val senderTier = LocalSenderTierResolver.resolve(
      history = history,
      senderKey = parsed.senderKey,
      conversationKey = parsed.conversationKey
    )
    val feedback = previous?.feedback?.takeIf { it != NotificationFeedback.NONE }
      ?: LocalNotificationFeedbackResolver.resolve(
        history = history,
        senderKey = parsed.senderKey,
        conversationKey = parsed.conversationKey
      )
    val score = scorer.score(
      NotificationSignal(
        senderTier = senderTier,
        urgency = UrgencyDetector.detect(parsed.textForScoring),
        feedback = feedback
      )
    )
    val decision = NotificationAdaptationPolicy.decide(
      NotificationAdaptationInput(
        score = score.points,
        isSelfNotification = false,
        isOngoing = notification.isProtectedFromInterruption(),
        hasContent = parsed.hasDisplayContent,
        hasOpenOriginalFallback = notification.contentIntent != null,
        canPostAttuneNotification = canPostAttuneNotification()
      )
    )

    val outcome = adaptNotification(sbn, notification, parsed, id, score, decision)
    val record = NotificationRecord(
      id = id,
      packageName = sbn.packageName,
      postedAtMs = sbn.postTime,
      senderTier = senderTier,
      urgencyScore = score.urgencyScore,
      baseScore = score.basePoints,
      score = score.points,
      reasonCodes = score.reasonCodes,
      feedback = feedback,
      senderKey = parsed.senderKey,
      conversationKey = parsed.conversationKey,
      isMessage = parsed.isMessage,
      adaptation = outcome.action,
      adaptationReason = outcome.reasonCode,
      hasOpenOriginalFallback = notification.contentIntent != null,
      sender = parsed.latestMessage?.senderName ?: parsed.displayTitle,
      conversation = parsed.conversationTitle,
      text = parsed.displayText
    )
    store.upsert(record)
    AttuneEventHub.publish("onNotificationRanked", record.toMap())
  }

  private fun adaptNotification(
    sbn: StatusBarNotification,
    notification: Notification,
    parsed: ParsedNotification,
    id: String,
    score: NotificationScore,
    decision: NotificationAdaptationDecision
  ): NotificationAdaptationDecision {
    return when (decision.action) {
      NotificationAdaptationAction.CANCEL_TO_DIGEST -> {
        val digestStored = digestStore.upsert(
          parsed.toDigestEntry(
            id = id,
            packageName = sbn.packageName,
            postedAtMs = sbn.postTime,
            score = score
          )
        )
        if (digestStored && postDigestNotification(parsed, id, score)) {
          cancelNotification(sbn.key)
          decision
        } else {
          NotificationAdaptationDecision(
            NotificationAdaptationAction.KEEP_ORIGINAL,
            "digest_storage_unavailable"
          )
        }
      }

      NotificationAdaptationAction.REPOST_ATTUNE -> {
        if (repostThroughAttuneChannel(sbn, notification, parsed, id, score)) {
          // Cancel only after notify() succeeded. The original PendingIntent remains attached to
          // the Attune copy, which is the safe open-original fallback. Source actions and
          // RemoteInput are intentionally not copied because forwarding them is not reliable.
          cancelNotification(sbn.key)
          digestStore.remove(id)
          decision
        } else {
          NotificationAdaptationDecision(
            NotificationAdaptationAction.KEEP_ORIGINAL,
            "attune_repost_unavailable"
          )
        }
      }

      NotificationAdaptationAction.KEEP_ORIGINAL -> {
        digestStore.remove(id)
        decision
      }

      NotificationAdaptationAction.IGNORE_SELF -> decision
    }
  }

  private fun repostThroughAttuneChannel(
    sbn: StatusBarNotification,
    source: Notification,
    parsed: ParsedNotification,
    id: String,
    score: NotificationScore
  ): Boolean {
    val originalIntent = source.contentIntent ?: return false
    if (!canPostAttuneNotification()) return false

    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      ?: return false
    ensurePriorityChannel(notificationManager)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      notificationManager.getNotificationChannel(ATTUNE_PRIORITY_CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE
    ) return false

    val reason = NotificationReasonFormatter.forScore(score)
    val title = parsed.displayTitle.ifBlank { sbn.packageName }
    val text = parsed.displayText.ifBlank { "Notification from ${sbn.packageName}" }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, ATTUNE_PRIORITY_CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setSubText("Attune · $reason")
      .setContentIntent(originalIntent)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setWhen(sbn.postTime)
      .setShowWhen(true)
      .addExtras(Bundle().apply { putBoolean(ATTUNE_REPOST_MARKER, true) })

    source.category?.let { builder.setCategory(it) }
    source.actions?.take(3)?.forEach { action ->
      val actionBuilder = Notification.Action.Builder(action.icon, action.title, action.actionIntent)
      action.remoteInputs?.forEach(actionBuilder::addRemoteInput)
      builder.addAction(actionBuilder.build())
    }
    return runCatching {
      notificationManager.notify(notificationTag(id), notificationId(id), builder.build())
      true
    }.getOrDefault(false)
  }

  /** Delivers a quiet, real digest notification before the source is cancelled. */
  private fun postDigestNotification(
    parsed: ParsedNotification,
    id: String,
    score: NotificationScore
  ): Boolean {
    if (!canPostAttuneNotification()) return false
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
    val channelId = "attune_digest"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(channelId, "Attune Digest", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Notifications Attune is holding for later"
        }
      )
      if (manager.getNotificationChannel(channelId)?.importance == NotificationManager.IMPORTANCE_NONE) return false
    }
    val text = parsed.displayText.ifBlank { "A notification was held for later." }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("Held for later")
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setSubText("Attune Digest · score ${score.points}")
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
    return runCatching {
      manager.notify("attune-digest:$id", notificationId("digest:$id"), builder.build())
      true
    }.getOrDefault(false)
  }

  private fun ensurePriorityChannel(notificationManager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      ATTUNE_PRIORITY_CHANNEL_ID,
      "Attune Priority",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notifications Attune prioritizes from your existing apps"
    }
    notificationManager.createNotificationChannel(channel)
  }

  private fun canPostAttuneNotification(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.N || manager.areNotificationsEnabled()
  }

  private fun isSelfNotification(
    sbn: StatusBarNotification,
    notification: Notification
  ): Boolean {
    if (sbn.packageName == packageName) return true
    return notification.extras?.getBoolean(ATTUNE_REPOST_MARKER, false) == true
  }

  private fun notificationTag(id: String): String = "attune:$id"

  private fun notificationId(id: String): Int {
    val numeric = id.take(8).toLongOrNull(16) ?: 1L
    return (numeric and 0x7fffffffL).toInt().coerceAtLeast(1)
  }

  private fun Notification.isProtectedFromInterruption(): Boolean {
    val protectedFlags = Notification.FLAG_ONGOING_EVENT or
      Notification.FLAG_FOREGROUND_SERVICE or
      Notification.FLAG_GROUP_SUMMARY or
      Notification.FLAG_NO_CLEAR
    return flags and protectedFlags != 0
  }
}

package app.attune.attunenative.notification

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationRankingTest {
  private val scorer = NotificationScorer()

  @Test
  fun urgentFamilyMessageOutranksUnknownMessage() {
    val family = scorer.score(
      NotificationSignal(
        senderTier = SenderTier.FAMILY,
        urgency = UrgencyDetector.detect("Urgent, call me now")
      )
    )
    val unknown = scorer.score(
      NotificationSignal(
        senderTier = SenderTier.UNKNOWN,
        urgency = UrgencyDetector.detect("photo shared")
      )
    )

    assertTrue(family.points > unknown.points)
    assertTrue("explicit_urgency" in family.reasonCodes)
    assertTrue("callback_request" in family.reasonCodes)
  }

  @Test
  fun explicitNegativeFeedbackLowersScoreWithoutChangingBase() {
    val signal = NotificationSignal(
      senderTier = SenderTier.CLOSE,
      urgency = UrgencySignals(directMention = true),
      feedback = NotificationFeedback.MARKED_NOT_IMPORTANT
    )
    val score = scorer.score(signal)

    assertEquals(44, score.basePoints)
    assertEquals(20, score.points)
    assertTrue("marked_not_important" in score.reasonCodes)
  }

  @Test
  fun feedbackRoundTripUpdatesDerivedRecordOnly() {
    val record = NotificationRecord("id", "com.chat", 10L, SenderTier.WORK, 0, 25, 25, emptyList())
    val updated = record.withFeedback(NotificationFeedback.REPLIED)

    assertEquals(37, updated.score)
    assertEquals("com.chat", updated.packageName)
    assertEquals(NotificationFeedback.REPLIED, updated.feedback)
  }

  @Test
  fun parsesMessagingStyleSenderAndConversationMetadata() {
    val parsed = NotificationParser.parseSnapshot(
      NotificationExtrasSnapshot(
        title = "WhatsApp",
        conversationTitle = "Weekend plans",
        isGroupConversation = true,
        template = "android.app.Notification\$MessagingStyle",
        messages = listOf(
          ParsedNotificationMessage(
            text = "Urgent: call me now",
            senderName = "Asha",
            senderIdentity = "Asha",
            timestampMs = 123L
          )
        )
      ),
      packageName = "com.whatsapp",
      shortcutId = "chat-7"
    )

    assertTrue(parsed.isMessage)
    assertEquals("Weekend plans", parsed.conversationTitle)
    assertEquals(true, parsed.isGroupConversation)
    assertEquals("Asha", parsed.latestMessage?.senderName)
    assertEquals("Urgent: call me now", parsed.displayText)
    assertEquals("Weekend plans", parsed.displayTitle)
    assertNotNull(parsed.senderKey)
    assertNotNull(parsed.conversationKey)
    assertTrue("Urgent: call me now" in parsed.textForScoring)
  }

  @Test
  fun nonMessageNotificationIsSafeAndHasNoSenderTier() {
    val parsed = NotificationParser.parseSnapshot(
      NotificationExtrasSnapshot(title = "System update", text = "Download complete"),
      packageName = "android"
    )

    assertFalse(parsed.isMessage)
    assertEquals(null, parsed.senderKey)
    assertEquals(SenderTier.UNKNOWN, LocalSenderTierResolver.resolve(emptyList(), null, null))
  }

  @Test
  fun upsertReplacesNotificationUpdateInsteadOfDuplicating() {
    val store = InMemoryNotificationRecordStore()
    val first = NotificationRecord("same", "com.chat", 10L, SenderTier.UNKNOWN, 0, 14, 14, emptyList())
    store.upsert(first)
    store.upsert(first.copy(postedAtMs = 20L, score = 72))

    assertEquals(1, store.all().size)
    assertEquals(20L, store.all().single().postedAtMs)
    assertEquals(72, store.all().single().score)
  }

  @Test
  fun persistedConversationFeedbackCanSetTierAndUnknownStaysHonest() {
    val store = InMemoryNotificationRecordStore()
    val first = NotificationRecord(
      id = "message-1",
      packageName = "com.chat",
      postedAtMs = 10L,
      senderTier = SenderTier.UNKNOWN,
      urgencyScore = 0,
      baseScore = SenderTier.UNKNOWN.baseScore,
      score = SenderTier.UNKNOWN.baseScore,
      reasonCodes = emptyList(),
      senderKey = "sender-hash",
      conversationKey = "conversation-hash",
      isMessage = true
    )
    store.upsert(first)
    store.updateFeedback("message-1", NotificationFeedback.fromWire("family")!!)

    assertEquals(
      SenderTier.FAMILY,
      LocalSenderTierResolver.resolve(store.all(), "sender-hash", "conversation-hash")
    )
    assertEquals(
      SenderTier.UNKNOWN,
      LocalSenderTierResolver.resolve(store.all(), "unseen-sender", "unseen-conversation")
    )
  }

  @Test
  fun persistedResponseFeedbackInfluencesTheNextNotificationInThatConversation() {
    val store = InMemoryNotificationRecordStore()
    store.upsert(
      NotificationRecord(
        id = "old-message",
        packageName = "com.chat",
        postedAtMs = 10L,
        senderTier = SenderTier.UNKNOWN,
        urgencyScore = 0,
        baseScore = SenderTier.UNKNOWN.baseScore,
        score = SenderTier.UNKNOWN.baseScore,
        reasonCodes = emptyList(),
        feedback = NotificationFeedback.REPLIED,
        conversationKey = "conversation-hash"
      )
    )

    assertEquals(
      NotificationFeedback.REPLIED,
      LocalNotificationFeedbackResolver.resolve(store.all(), null, "conversation-hash")
    )
  }

  @Test
  fun fileStorePersistsFeedbackAndUpsertAcrossInstances() {
    val file = File.createTempFile("attune-notifications", ".json")
    file.delete()
    try {
      val testClock = { 20L }
      val firstStore = FileNotificationRecordStore(file, nowMs = testClock)
      firstStore.upsert(
        NotificationRecord(
          id = "persistent-id",
          packageName = "com.chat",
          postedAtMs = 10L,
          senderTier = SenderTier.UNKNOWN,
          urgencyScore = 0,
          baseScore = SenderTier.UNKNOWN.baseScore,
          score = SenderTier.UNKNOWN.baseScore,
          reasonCodes = emptyList(),
          senderKey = "sender-hash",
          conversationKey = "conversation-hash"
        )
      )
      firstStore.updateFeedback("persistent-id", NotificationFeedback.REPLIED)

      val secondStore = FileNotificationRecordStore(file, nowMs = testClock)
      assertEquals(NotificationFeedback.REPLIED, secondStore.find("persistent-id")?.feedback)
      assertEquals(1, secondStore.all().size)
    } finally {
      file.delete()
    }
  }

  @Test
  fun adaptationNeverCancelsWithoutDigestAndNeverRepostsWithoutOpenOriginalFallback() {
    val low = NotificationAdaptationPolicy.decide(
      NotificationAdaptationInput(
        score = 20,
        isSelfNotification = false,
        isOngoing = false,
        hasContent = true,
        hasOpenOriginalFallback = false,
        canPostAttuneNotification = true
      )
    )
    val highWithoutFallback = NotificationAdaptationPolicy.decide(
      NotificationAdaptationInput(
        score = 90,
        isSelfNotification = false,
        isOngoing = false,
        hasContent = true,
        hasOpenOriginalFallback = false,
        canPostAttuneNotification = true
      )
    )

    assertEquals(NotificationAdaptationAction.CANCEL_TO_DIGEST, low.action)
    assertEquals(NotificationAdaptationAction.KEEP_ORIGINAL, highWithoutFallback.action)
    assertEquals("missing_open_original_fallback", highWithoutFallback.reasonCode)
  }

  @Test
  fun digestUpsertKeepsNotificationUpdatesDeduplicated() {
    val store = InMemoryNotificationDigestStore()
    store.upsert(NotificationDigestEntry("digest-id", "com.chat", 1L, "Chat", "first", 20, emptyList()))
    store.upsert(NotificationDigestEntry("digest-id", "com.chat", 2L, "Chat", "updated", 18, emptyList()))

    assertEquals(1, store.all().size)
    assertEquals("updated", store.all().single().text)
  }

  @Test
  fun highScoreUsesAttuneRepostOnlyWhenTheOriginalCanBeOpened() {
    val decision = NotificationAdaptationPolicy.decide(
      NotificationAdaptationInput(
        score = 80,
        isSelfNotification = false,
        isOngoing = false,
        hasContent = true,
        hasOpenOriginalFallback = true,
        canPostAttuneNotification = true
      )
    )

    assertEquals(NotificationAdaptationAction.REPOST_ATTUNE, decision.action)
  }

  @Test
  fun selfAndProtectedNotificationsAreNeverAdapted() {
    val self = NotificationAdaptationPolicy.decide(
      NotificationAdaptationInput(
        score = 90,
        isSelfNotification = true,
        isOngoing = false,
        hasContent = true,
        hasOpenOriginalFallback = true,
        canPostAttuneNotification = true
      )
    )
    val ongoing = NotificationAdaptationPolicy.decide(
      NotificationAdaptationInput(
        score = 10,
        isSelfNotification = false,
        isOngoing = true,
        hasContent = true,
        hasOpenOriginalFallback = false,
        canPostAttuneNotification = true
      )
    )

    assertEquals(NotificationAdaptationAction.IGNORE_SELF, self.action)
    assertEquals(NotificationAdaptationAction.KEEP_ORIGINAL, ongoing.action)
  }
}

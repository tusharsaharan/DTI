package app.attune.attunenative.keyboard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HinglishTokenLearnerTest {
  @Test
  fun learnerKeepsPersonalCodeSwitchedTokensOnDevice() {
    val learner = HinglishTokenLearner()
    learner.learn("kal class mein milte hain")
    learner.learn("kal milte hain")

    assertEquals(2, learner.suggestions("mi", 1).single().count)
    assertTrue("kal" in learner.snapshot())
    assertTrue("mein" in learner.snapshot())
  }

  @Test
  fun restoreRejectsInvalidEntries() {
    val learner = HinglishTokenLearner()
    learner.restore(mapOf("valid" to 2, "" to 4, "x" to 8, "negative" to -1))

    assertEquals(mapOf("valid" to 2), learner.snapshot())
  }

  @Test
  fun personalizedLearningOptOutIsTreatedAsSecure() {
    val normal = android.text.InputType.TYPE_CLASS_TEXT
    val optOut = normal or android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
    val noSuggestions = normal or android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
    val password = normal or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD

    assertTrue(SecureEditorPolicy.allowsLearning(normal))
    assertFalse(SecureEditorPolicy.allowsLearning(optOut))
    assertFalse(SecureEditorPolicy.allowsLearning(noSuggestions))
    assertFalse(SecureEditorPolicy.allowsLearning(password))
  }

  @Test
  fun missingInputConnectionIsAHandledNoOp() {
    assertFalse(InputConnectionSafety.commitText(null, "hello"))
    assertFalse(InputConnectionSafety.deleteSurroundingText(null, 1, 0))
    assertFalse(InputConnectionSafety.sendEnter(null))
  }
}

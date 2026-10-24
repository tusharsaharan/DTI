package app.attune.attunenative.keyboard

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class LearnedToken(val token: String, val count: Int)

class HinglishTokenLearner(private val maxTokens: Int = 2_000) {
  private val counts = linkedMapOf<String, Int>()

  @Synchronized
  fun learn(text: CharSequence) {
    text.toString().split(Regex("[^\\p{L}\\p{N}_']+")).asSequence()
      .map { it.trim().lowercase() }
      .filter { it.length >= 2 && it.length <= 64 }
      .forEach { token ->
        counts[token] = (counts[token] ?: 0) + 1
      }
    trim()
  }

  @Synchronized
  fun suggestions(prefix: String, limit: Int = 5): List<LearnedToken> {
    val normalized = prefix.lowercase()
    return counts.entries
      .filter { it.key.startsWith(normalized) }
      .sortedByDescending { it.value }
      .take(limit.coerceIn(0, 20))
      .map { LearnedToken(it.key, it.value) }
  }

  @Synchronized
  fun snapshot(): Map<String, Int> = counts.toMap()

  @Synchronized
  fun restore(values: Map<String, Int>) {
    counts.clear()
    values.forEach { (token, count) ->
      if (token.length in 2..64 && count > 0) counts[token] = count
    }
    trim()
  }

  private fun trim() {
    while (counts.size > maxTokens) {
      counts.entries.minByOrNull { it.value }?.key?.let(counts::remove) ?: break
    }
  }
}

object SecureEditorPolicy {
  fun allowsLearning(inputType: Int): Boolean {
    val variation = inputType and android.text.InputType.TYPE_MASK_VARIATION
    val isPassword = variation == android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      variation == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      variation == android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      variation == android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
    val disablesSuggestions = inputType and android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS != 0
    val disablesPersonalizedLearning = inputType and android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0
    return !isPassword && !disablesSuggestions && !disablesPersonalizedLearning
  }
}

class EncryptedTokenLearnerStore(context: Context) {
  private val file = File(context.filesDir, "attune_keyboard_tokens.bin")
  private val alias = "attune_keyboard_tokens"

  fun load(learner: HinglishTokenLearner) {
    if (!file.exists()) return
    runCatching {
      val bytes = file.readBytes()
      val ivLength = ByteBuffer.wrap(bytes).int
      val iv = bytes.copyOfRange(4, 4 + ivLength)
      val cipherText = bytes.copyOfRange(4 + ivLength, bytes.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      val encoded = cipher.doFinal(cipherText).toString(Charsets.UTF_8)
      val values = encoded.split('\n').asSequence()
        .filter { it.isNotBlank() }
        .mapNotNull { line ->
          val parts = line.split('\t', limit = 2)
          parts.getOrNull(0)?.let { token -> parts.getOrNull(1)?.toIntOrNull()?.let { token to it } }
        }.toMap()
      learner.restore(values)
    }.onFailure {
      // A truncated or incompatible encrypted file must not prevent the keyboard from starting.
      // Delete only the unreadable local blob; no typed text is recoverable or exported.
      clear()
    }
  }

  fun save(learner: HinglishTokenLearner) {
    runCatching {
      val plain = learner.snapshot().entries.joinToString("\n") { "${it.key}\t${it.value}" }.toByteArray()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key())
      val iv = cipher.iv
      val encrypted = cipher.doFinal(plain)
      file.parentFile?.mkdirs()
      file.writeBytes(ByteBuffer.allocate(4 + iv.size + encrypted.size).apply {
        putInt(iv.size)
        put(iv)
        put(encrypted)
      }.array())
    }
  }

  fun clear(): Boolean = runCatching {
    !file.exists() || file.delete()
  }.getOrDefault(false)

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setUserAuthenticationRequired(false)
        .build()
    )
    return generator.generateKey()
  }
}

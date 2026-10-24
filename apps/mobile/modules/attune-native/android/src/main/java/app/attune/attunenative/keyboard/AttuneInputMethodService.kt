package app.attune.attunenative.keyboard

import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.widget.Button
import android.widget.LinearLayout

object KeyboardRuntime {
  @Volatile var selected: Boolean = false
  @Volatile var learningAllowed: Boolean = false
  @Volatile var learnedTokenCount: Int = 0
  @Volatile var clearRequested: Boolean = false
}

class AttuneInputMethodService : InputMethodService() {
  private val learner = HinglishTokenLearner()
  private lateinit var store: EncryptedTokenLearnerStore
  private var learningAllowed = false
  private val pendingToken = StringBuilder()

  override fun onCreate() {
    super.onCreate()
    store = EncryptedTokenLearnerStore(this)
    KeyboardRuntime.clearRequested = false
    store.load(learner)
    KeyboardRuntime.selected = true
    KeyboardRuntime.learnedTokenCount = learner.snapshot().size
  }

  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting)
    pendingToken.clear()
    learningAllowed = attribute?.let { SecureEditorPolicy.allowsLearning(it.inputType) } == true
    KeyboardRuntime.learningAllowed = learningAllowed
  }

  override fun onFinishInput() {
    super.onFinishInput()
    learnPendingToken()
    learningAllowed = false
    KeyboardRuntime.learningAllowed = false
  }

  override fun onCreateInputView(): View = KeyboardLayout(this).also { layout ->
    layout.bind({ currentInputConnectionSafely() }, { prefix -> learner.suggestions(prefix, 3) }) { text ->
      if (learningAllowed) {
        if (text.any { it.isWhitespace() }) {
          learnPendingToken()
        } else {
          pendingToken.append(text)
        }
      }
    }
  }

  override fun onDestroy() {
    learnPendingToken()
    if (::store.isInitialized) store.save(learner)
    KeyboardRuntime.selected = false
    super.onDestroy()
  }

  private fun currentInputConnectionSafely(): InputConnection? =
    runCatching { currentInputConnection }.getOrNull()

  private fun learnPendingToken() {
    if (KeyboardRuntime.clearRequested) {
      learner.restore(emptyMap())
      pendingToken.clear()
      store.clear()
      KeyboardRuntime.clearRequested = false
      KeyboardRuntime.learnedTokenCount = 0
      return
    }
    if (!learningAllowed || pendingToken.isEmpty()) return
    learner.learn(pendingToken)
    pendingToken.clear()
    store.save(learner)
    KeyboardRuntime.learnedTokenCount = learner.snapshot().size
  }
}

/** InputConnection can disappear between a key press and an editor lifecycle callback. */
object InputConnectionSafety {
  fun commitText(connection: InputConnection?, text: CharSequence, cursorPosition: Int = 1): Boolean =
    connection?.let { runCatching { it.commitText(text, cursorPosition) }.getOrDefault(false) } ?: false

  fun deleteSurroundingText(connection: InputConnection?, beforeLength: Int, afterLength: Int): Boolean =
    connection?.let { runCatching { it.deleteSurroundingText(beforeLength, afterLength) }.getOrDefault(false) } ?: false

  fun sendEnter(connection: InputConnection?): Boolean {
    if (connection == null) return false
    return runCatching {
      val down = connection.sendKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_ENTER))
      val up = connection.sendKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_ENTER))
      down && up
    }.getOrDefault(false)
  }
}

private class KeyboardLayout(context: android.content.Context) : LinearLayout(context) {
  private var inputConnectionProvider: (() -> InputConnection?)? = null
  private var suggestionProvider: ((String) -> List<LearnedToken>)? = null
  private var onTextCommitted: ((String) -> Unit)? = null
  private lateinit var suggestionRow: LinearLayout

  init {
    orientation = VERTICAL
    setBackgroundColor(Color.rgb(20, 20, 22))
    setPadding(8, 8, 8, 8)
  }

  fun bind(
    connectionProvider: () -> InputConnection?,
    suggestionProvider: (String) -> List<LearnedToken>,
    onTextCommitted: (String) -> Unit
  ) {
    inputConnectionProvider = connectionProvider
    this.suggestionProvider = suggestionProvider
    this.onTextCommitted = onTextCommitted
    removeAllViews()
    suggestionRow = LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER
      layoutParams = LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 46)
    }
    addView(suggestionRow)
    refreshSuggestions()
    listOf("qwertyuiop", "asdfghjkl", "zxcvbnm").forEach { row ->
      val rowLayout = LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER
        layoutParams = LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 52)
      }
      row.forEach { letter ->
        rowLayout.addView(key(letter.toString(), 1f) {
            if (InputConnectionSafety.commitText(inputConnectionProvider?.invoke(), letter.toString())) {
              onTextCommitted?.invoke(letter.toString())
              refreshSuggestions()
          }
        })
      }
      addView(rowLayout)
    }
    val controls = LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER
      layoutParams = LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 58)
    }
    controls.addView(key("⌫", 1.5f) {
      InputConnectionSafety.deleteSurroundingText(inputConnectionProvider?.invoke(), 1, 0)
      refreshSuggestions()
    })
    controls.addView(key("space", 4f) {
      if (InputConnectionSafety.commitText(inputConnectionProvider?.invoke(), " ")) {
        onTextCommitted?.invoke(" ")
        refreshSuggestions()
      }
    })
    controls.addView(key("↵", 1.5f) {
      InputConnectionSafety.sendEnter(inputConnectionProvider?.invoke())
    })
    addView(controls)
  }

  private fun refreshSuggestions() {
    if (!::suggestionRow.isInitialized) return
    suggestionRow.removeAllViews()
    val connection = inputConnectionProvider?.invoke()
    val beforeCursor = runCatching { connection?.getTextBeforeCursor(64, 0)?.toString().orEmpty() }.getOrDefault("")
    val prefix = beforeCursor.takeLastWhile { it.isLetterOrDigit() || it == '\'' }
    val suggestions = suggestionProvider?.invoke(prefix).orEmpty()
    suggestions.forEach { suggestion ->
      suggestionRow.addView(key(suggestion.token, 1f) {
        val current = inputConnectionProvider?.invoke()
        val currentBeforeCursor = runCatching { current?.getTextBeforeCursor(64, 0)?.toString().orEmpty() }.getOrDefault("")
        val currentPrefix = currentBeforeCursor.takeLastWhile { it.isLetterOrDigit() || it == '\'' }
        if (currentPrefix.isNotEmpty()) InputConnectionSafety.deleteSurroundingText(current, currentPrefix.length, 0)
        if (InputConnectionSafety.commitText(current, "${suggestion.token} ")) {
          onTextCommitted?.invoke(" ")
          refreshSuggestions()
        }
      })
    }
  }

  private fun key(label: String, weight: Float, action: () -> Unit): Button = Button(context).apply {
    text = label
    setTextColor(Color.WHITE)
    setOnClickListener { action() }
    layoutParams = LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, weight).apply {
      setMargins(2, 2, 2, 2)
    }
  }
}

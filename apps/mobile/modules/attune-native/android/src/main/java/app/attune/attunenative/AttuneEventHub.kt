package app.attune.attunenative

import java.util.concurrent.CopyOnWriteArraySet

/** A small process-local bridge from Android services to the Expo module instance. */
object AttuneEventHub {
  private val listeners = CopyOnWriteArraySet<(String, Map<String, Any?>) -> Unit>()

  fun add(listener: (String, Map<String, Any?>) -> Unit) {
    listeners.add(listener)
  }

  fun remove(listener: (String, Map<String, Any?>) -> Unit) {
    listeners.remove(listener)
  }

  fun publish(eventName: String, payload: Map<String, Any?>) {
    listeners.forEach { listener -> listener(eventName, payload) }
  }
}

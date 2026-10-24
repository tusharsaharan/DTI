# PLAN.md — Attune: Same Phone, Just Smarter

**Deliverable:** one premium Android app that really changes how your phone behaves. It works with real messages, real DND, real notifications, real volume, a real system keyboard, and real screen time.
No website. No mock data and no "demo mode". Every feature runs on the user's actual phone, all day, in the background.

---

## 1. Product principles
1. **Design first.** This is Design Thinking & Innovation, so the app should look and feel like a flagship product (see §3).
2. **Real, not staged.** Every feature reads real system signals and takes real system actions. If something can't be done on Android, we say so in the UI instead of faking it.
3. **Always on, low cost.** Background services that are battery-aware (duty-cycled sensing, WorkManager, hysteresis), so the app is usable as a daily driver.
4. **Private by construction.** All sensing and models run on-device. Raw text, audio and video never leave the phone. Only DP-noised model updates are uploaded, and only for the keyboard (opt-in).
5. **Graceful without permissions.** Every feature has a best, good and minimum mode (§6). It never crashes and never nags.
6. **One connected system.** The deck's loop *Sense → Understand → Adapt → Protect → Care*, implemented as one shared Context Engine that all 5 features read from.

## 2. Stack
| Layer | Choice | Why |
|---|---|---|
| App UI | **Expo (SDK latest) dev build + React Native (New Architecture) + TypeScript**, `expo-router` | Fast premium UI work, one codebase, native modules when needed |
| Motion / graphics | `react-native-reanimated`, `react-native-gesture-handler`, **`@shopify/react-native-skia`** (gauges, rings, charts), `expo-haptics`, `expo-blur`, `moti` | 60/120 fps fluid motion, custom drawn visuals instead of stock charts |
| System features | **Kotlin native modules via the Expo Modules API** | NotificationListener, DND policy, AudioManager, UsageStats, foreground services, Activity Recognition |
| Keyboard | **Kotlin IME forked from FlorisBoard** (Apache-2.0), themed to match Attune | Only a native `InputMethodService` can be a real system keyboard |
| On-device ML | TFLite (Kotlin `tensorflow-lite` / `react-native-fast-tflite`), MediaPipe Face Landmarker, YAMNet | Runs offline, fast |
| Local data | Room (Kotlin, used by services) exposed to RN, or `op-sqlite` | Services write even when the UI is closed |
| Background | Foreground services (types `microphone`, `camera`, `specialUse`), WorkManager, BroadcastReceivers (boot, screen on/off) | Survives reboots and Android 14 rules |
| Federated server | **Python FastAPI + Flower strategy (FedAvg + DP)** in Docker, deployable to any host (Render, Fly.io, Railway, VPS) | Real multi-device learning, not a laptop-only demo |
| Extras | Quick Settings tiles, home-screen widget (Jetpack Glance), app shortcuts | Feels like part of the OS |

## 3. Design direction (the first thing the jury sees)
- **Feel:** calm, editorial, quietly confident, closer to Nothing OS, Arc, Linear, Apple Fitness and Oura than to a typical student app. Generous whitespace, large tight-tracked numerals, one accent colour per feature on a neutral base.
- **System:** a token file (colour, type scale, spacing, radius, elevation, motion durations and springs) shared by RN and the keyboard theme. Dark and light themes plus Material You dynamic-colour support.
- **Type:** a premium grotesk for UI (e.g. *Inter Display* / *Geist* / *General Sans*) plus a mono for numbers. Big numeric hero stats.
- **Motion:** spring-based shared-element transitions, scroll-linked headers, haptic ticks on every state change, a living "pulse" for the Context Engine, and skeleton states instead of spinners.
- **Signature screens:**
  - **Today:** one living context card ("In class · still · campus Wi-Fi → only urgent gets through"), with 5 feature tiles below showing their live state.
  - **Feature pages:** a hero visual (Skia), "what happened today" timeline, controls, and a privacy card.
  - **Onboarding:** one story screen per idea (personas Varun, Aryan, Lakshya, Vivek and Shivam from the deck), then a calm, one-at-a-time permission flow that explains each request.
  - **Weekly Care report:** kind framing, not guilt.
- **Process:** design key screens first (Figma MCP or high-fidelity generated mockups), get sign-off, then build. Review each screen with the design-critique / polish skills before calling it done.

## 4. Architecture
```
 ┌───────────────────────── Kotlin services (always on) ─────────────────────────┐
 │ AttuneNotificationListener   ContextService (activity, calendar, place, app)  │
 │ AttentionService (camera)    AmbientService (mic)        Attune IME (keyboard) │
 └───────────────┬───────────────────────────────────────────────────────────────┘
                 ▼  events
        Context Engine  ──►  context = {place, activity, inEvent, appCategory,
          (Kotlin)            noiseDb, env, attention, interruptibility}
                 │
   ┌─────────────┼──────────────┬──────────────┬──────────────┐
   ▼             ▼              ▼              ▼              ▼
 Rank & re-alert  Smart DND    Auto volume   True screen time  Keyboard LM
   (1)           (3)            (5)            (4)             (2)
                 │
          Room DB  ──►  RN app (Expo) reads via native module + event emitter
```
Cross-feature rules (real behaviour):
- Smart DND (3) always lets Attune Priority alerts (1) and repeated calls from starred or family contacts through.
- Auto volume (5) falls back to the place and activity profile from (3) when the mic is denied, and backs off when headphones are connected.
- Screen time (4) uses activity (3) to classify passive use (navigation in a vehicle, propped and still).
- Notification ranking (1) lowers the threshold when interruptibility is high and raises it in class or meetings.

## 5. Features at full scale

### 1 · Priority Inbox: smart notification ranking (Aman, Prince)
- **Real input:** a `NotificationListenerService` sees every notification from WhatsApp, Telegram, Instagram, Gmail, SMS, Teams and others. It parses `MessagingStyle` for the sender, group, and each message.
- **Understanding:** score = sender tier (family/close/class/work/unknown, learned from reply rate and response time plus user tags) + urgency NLP (a multilingual MiniLM-class TFLite classifier for English and Hinglish, plus rules for deadlines, times, dates, @mentions and "urgent/hall/changed/call me") + personal history (an online logistic-regression model updated on open, reply, dismiss and explicit feedback).
- **Real action:** low-score notifications are cancelled from the shade and saved to a digest delivered on a schedule or at unlock. High-score ones are re-posted on Attune's Priority channel (heads-up, reason chip, and reply/mark-read actions forwarded through the original `RemoteInput`/`PendingIntent`, so you reply to the real chat).
- **Learning loop:** "Important / Not important" actions on every Attune notification, plus per-chat rules.
- **Honest constraint:** the user mutes the noisy group in WhatsApp, and Attune becomes the smart sound for it. Onboarding guides this.

### 2 · Attune Keyboard: Hinglish and code-switching, federated (Riya, Shreya)
- **Real input:** a full system keyboard (FlorisBoard fork) usable in every app.
- **Model:** a Hinglish and English lexicon with romanised-Hindi spelling variants (seeded from AI4Bharat IndicXlit and Hinglish corpora), plus a language-ID-per-token model so code-switched text isn't "corrected", plus a **personal n-gram model** that learns your spellings and phrases on-device. Personal data is encrypted with the Android Keystore.
- **Federated learning (real):** at night on Wi-Fi while charging (WorkManager), the phone computes model weight deltas, clips them, adds DP noise, and uploads them to the Attune FL server. The server runs FedAvg and publishes a new global model version, which phones download. No text ever leaves the device. An in-app "Learning" page shows rounds joined, privacy budget, and model version.
- **Value metrics in-app:** corrections avoided and keystrokes saved per week.

### 3 · Smart Focus: context-aware DND (Rahul, Yash)
- **Real input:** Activity Recognition Transition API, `CalendarContract` events, place (Wi-Fi SSID and geofences the user labels: home, college, library, office), foreground app category (UsageEvents), charging, headphones, time.
- **Model:** an on-device interruptibility score (0–100) from a small gradient-boosted tree, personalised from manual DND toggles and answered or ignored calls, plus explicit rules the user can see and edit.
- **Real action:** `NotificationManager.setInterruptionFilter` + `setNotificationPolicy` (priority senders, repeat callers). This is real DND. A Quick Settings tile and a widget show the current state and the reason.
- **Transparency:** every automatic change is logged with its reason ("DND on: Viva in calendar, phone still, college Wi-Fi"), and can be undone in one tap.

### 4 · True Screen Time: attention-accurate usage (Tushar, Rakesh)
- **Real baseline:** `UsageStatsManager` / `UsageEvents` give per-app screen time, matching what Android Digital Wellbeing reports.
- **Attention:** a camera foreground service runs MediaPipe Face Landmarker, duty-cycled (one frame every 2–3 s while the screen is on). Iris and head pose give an on-screen gaze probability. The gaze maths is ported from the existing `trueattention` code in this repo (`lib/features.ts`, `lib/classifier.ts`, `lib/calibration.ts`). No frames are stored.
- **Output:** per app, *attended* vs *glance* vs *passive* (propped, navigation, audio-only) minutes, and "Android says 3h 10m · you really spent 1h 52m". A weekly Care report.
- **Without the camera:** see §6a.

### 5 · Ambient Volume: noise-adaptive ringer (Omprakash, Varshith)
- **Real input:** a mic foreground service records 1 s windows every 20–30 s (plus right before an incoming ring when possible) → dB (calibrated per device), plus YAMNet TFLite → environment (quiet/library, conversation, street, transit, music).
- **Real action:** `AudioManager` ring and notification stream volumes follow a user-tunable curve, with hysteresis, min/max limits, a quick-response mode when a call starts, and headphone awareness.
- **Learning:** manual volume changes nudge the curve per place.
- **Privacy:** audio exists only in memory for 1 s. Only the dB number and class label are kept.

## 6. When permissions are denied

### 6a. Screen time without the camera (evaluated approaches)
| Approach | Signals | Expected accuracy | Battery | Role |
|---|---|---|---|---|
| A. Camera gaze | MediaPipe iris + head pose | Highest | Medium | "Max accuracy" mode |
| B. Sensor fusion | Screen-on bursts < 10 s = glance · touch/typing recency (from the Attune IME and UsageEvents interaction events) · accelerometer stillness + orientation = propped · vehicle activity + maps = navigation · media app without touch = watching · proximity = pocket | Good | Very low | Automatic when the camera is denied |
| **C. Hybrid personal calibration** | Camera used only during a short opt-in calibration period. It labels moments to train a personal *sensors → attention* model on-device, then the camera turns off | Close to A | Low | **Default** |
| D. Usage only | UsageStats minus unlock-glances minus known-passive contexts | Fair | ~0 | Minimum |

Validation: we record our own sessions with hand-labelled ground truth and report the error of each approach against Android's number inside the app ("how accurate is this?").

### 6b. Other fallbacks
| Feature | Denied | Fallback |
|---|---|---|
| 1 | Notification access | The feature can't work. A clear explanation and a deep link to settings. (We don't fake it.) |
| 2 | Not chosen as the keyboard | A typing pad inside the app with the same model. Federated learning still works |
| 3 | Location | Wi-Fi SSID labels. Without those, calendar + activity |
| 3 | Activity recognition | Our own accelerometer-variance classifier |
| 3 | Calendar | Learned weekly schedule + manual quick tile |
| 5 | Microphone | Place and activity profile from (3) + learned manual adjustments |
| all | Battery optimisation | Exemption asked once during onboarding, plus a WorkManager periodic fallback |

## 7. Open-source we build on
Clone references into `/vendor` (git-ignored) and credit them in `CREDITS.md`. ✓ = confirmed by search. Verify the licence and last commit before forking the rest.

| Feature | Repo / lib | Licence | Use |
|---|---|---|---|
| 1 | ✓ react-native-android-notification-listener | MIT | Reference / quick start. Final listener is our Kotlin service |
| 1, 4, 5 | react-native-fast-tflite · TensorFlow Lite | MIT / Apache | On-device models |
| 2 | **FlorisBoard** (alt: HeliBoard, GPL-3.0 · AnySoftKeyboard) | Apache-2.0 | Keyboard base |
| 2 | AI4Bharat IndicXlit · LinCE · Hinglish corpora on Hugging Face | MIT / various | Lexicon and LM seed |
| 2 | ✓ Flower (server) · ✓ FedKit (reference) | Apache-2.0 | FedAvg + DP |
| 3 | Play Services Activity Recognition · expo-calendar · expo-sensors | Apache / MIT | Context |
| 4 | MediaPipe Face Landmarker (google-ai-edge/mediapipe-samples) · ✓ react-native-vision-camera-face-detector · existing `trueattention` lib | Apache / MIT | Gaze |
| 5 | ✓ YAMNet TFLite (`tensorflow-lite-task-audio`) | Apache-2.0 | Environment class |
| UI | Reanimated, Skia, Gesture Handler, Moti, expo-haptics, expo-blur | MIT | Premium motion and visuals |

Native modules we write: `attune-notify`, `attune-context`, `attune-dnd`, `attune-volume`, `attune-usage`, `attune-attention`.

## 8. Build phases
| Phase | Work | Model |
|---|---|---|
| 0 | Repo restructure: `apps/mobile` (Expo dev build), `apps/keyboard` (FlorisBoard fork), `server/fl`, `packages/design-tokens`. Archive the old web app to `legacy/web` and keep its gaze lib | Sonnet |
| 1 | **Design:** tokens, type, motion spec, key screens (Today, 5 feature pages, onboarding, Care report), review and polish | Sonnet + design skills (Opus review) |
| 2 | App shell + onboarding/permission flow + Context Engine + Room DB + event bridge | Sonnet (Opus architecture review) |
| 3 | In parallel, one sub-agent each: Priority Inbox (1) · Smart Focus (3) · Ambient Volume (5) | Sonnet ×3, Haiku for docs and tests |
| 4 | True Screen Time (4): UsageStats + attention service + fallback model | Sonnet |
| 5 | Attune Keyboard (2) + FL server (Docker, deploy) | Sonnet |
| 6 | Cross-feature rules, battery profiling, OEM background-kill handling, accuracy validation, final polish on real devices via mobile-mcp | Sonnet, Opus final review |

**Needed before Phase 0:** Android Studio / SDK (`adb` isn't installed yet), and an Android 10+ phone with USB debugging turned on.

## 9. Risks
- **Android 14+ foreground-service rules** for camera and mic: start the services while the app is visible, declare the right service types, and show a persistent "Attune is sensing" notification.
- **OEM background killers** (Xiaomi, Oppo, Vivo, Samsung): a guided exemption flow per manufacturer.
- **The keyboard is the largest scope.** The in-app pad keeps the federated feature usable meanwhile.
- **Notification ranking needs the user to mute groups in the source app.** It's guided in onboarding, and we're honest about it in the UI.

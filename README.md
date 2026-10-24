
# Attune — Same Phone, Just Smarter

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Android-green.svg)](apps/mobile)
[![Framework](https://img.shields.io/badge/Framework-Expo%20%7C%20React%20Native%20%7C%20Kotlin-black.svg)](apps/mobile)
[![Federated Learning](https://img.shields.io/badge/FL-FastAPI%20%7C%20Flower-orange.svg)](server/fl)

An installable, on-device Android prototype developed for **Design Thinking & Innovation (DTI)**.

Attune unifies five ambient-intelligence capabilities around one continuous loop:  
**Sense → Understand → Adapt → Protect → Care**.

Rather than mockups or cloud-dependent demos, Attune is engineered as a real Android system application: reading real hardware and OS signals, performing real system actions, and running privacy-preserving machine learning directly on the device.

---

## 🌟 The 5 Core Capabilities

| # | Feature | Core Signal | System Action | Privacy Boundary |
|---|---|---|---|---|
| **1** | **Priority Inbox** | Notifications (`NotificationListenerService`), sender reply rates, urgency NLP | Suppresses low-value alerts; re-alerts high-urgency messages on a priority channel with native reply routing | Notification bodies and contact graphs never leave the device |
| **2** | **Attune Keyboard** | Typing patterns, Hinglish / code-switching lexicons | System `InputMethodService` keyboard with on-device n-gram personalization and transliteration | Keystrokes never leave device; optional FL uploads bounded, DP-noised numeric weight deltas only |
| **3** | **Smart Focus** | Activity Recognition, Calendar, Wi-Fi / geofence place, app foreground usage | Real DND switching (`NotificationManager.setInterruptionFilter` & policy) | Context history stored locally in encrypted storage |
| **4** | **True Screen Time** | `UsageStatsManager` baseline + front camera duty-cycled gaze tracking | Distinguishes *active attention* from *passive / propped glance* screen time | Camera frames are processed in-memory and discarded; zero frames stored or transmitted |
| **5** | **Ambient Volume** | Microphone dB sampling & environment acoustic classification | Dynamic ring and notification volume adjustment (`AudioManager`) with hysteresis | Audio buffers exist in-memory for 1 second max; only summary dB and env class are retained |

---

## 🏛️ System Architecture

Attune separates persistent, low-overhead system sensing (written in Kotlin) from the user interface (built with React Native & Expo Modules):

```
┌────────────────────────────────── Android Platform ──────────────────────────────────┐
│                                                                                      │
│   AttuneNotificationListener      AttuneInputMethodService      AndroidAmbientService│
│   (NotificationListenerService)   (System IME Keyboard)         (AudioRecord / dB)   │
│                                                                                      │
│   AndroidUsageStatsSource         CameraAttentionService        ContextSnapshot      │
│   (UsageStatsManager)             (Front Camera Gaze)           (Activity / Place)   │
│                                                                                      │
└──────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────── @attune/native (Kotlin Module) ───────────────────────────┐
│                                                                                      │
│   • Urgency NLP & Notification Scorer       • Interruptibility Engine (0–100)        │
│   • Hinglish Token Learner & N-gram Store   • Ambient Volume Decibel Mapper          │
│   • Attention Classifier & Gaze Logic       • Native History Store & Event Hub       │
│                                                                                      │
└──────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │ Event Emitter & Native Methods
                                           ▼
┌──────────────────────────── React Native App (Expo SDK 58) ───────────────────────────┐
│                                                                                      │
│   • Today / Live Context Dashboard          • Real-time Native State Sync & Hydration│
│   • Per-Feature Controls & Timelines        • System Permission & Degradation Flows  │
│   • Weekly Care & Attention Reports         • Premium Editorial UI & Design Tokens   │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ (Optional: Opt-in, at night, on Wi-Fi)
                                           │ Bounded Numeric Gradients + DP Noise
                                           ▼
┌──────────────────────── Federated Learning Server (server/fl) ───────────────────────┐
│                                                                                      │
│   • FastAPI + Flower FedAvg aggregation     • DP noise declaration verification      │
│   • 2-client minimum threshold per round    • Zero text, keystrokes, or raw payloads │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Privacy & Degradation Guarantees

1. **On-Device Exclusivity**:
   - Raw notification contents, keystrokes, camera frames, and audio waveforms **never** leave the phone.
2. **Graceful Permission Degradation**:
   - If a permission is denied (e.g., Camera or Microphone), the corresponding feature transitions into an honest fallback mode (e.g., True Screen Time uses usage stats; Ambient Volume falls back to scheduled place profiles). The app never crashes and never nags.
3. **Differential Privacy in Federated Learning**:
   - Only numeric parameter updates are synced. Clients clip gradients and apply Gaussian differential privacy (DP) noise on-device before any transfer.

---

## 📁 Repository Layout

```text
.
├── apps/
│   └── mobile/                       # Expo (React Native) Android app
│       ├── modules/attune-native/    # Local Kotlin Expo module (services, IME, listeners)
│       │   ├── android/              # Native Kotlin source and AndroidManifest
│       │   └── src/test/             # Native Kotlin JUnit tests
│       ├── src/
│       │   ├── app/                  # Expo Router file-based screens (tabs, features)
│       │   ├── components/           # UI components, cards, charts, heroes
│       │   ├── state/                # Native contract bridges, hydration, action hooks
│       │   └── theme/                # Design tokens, color palettes, spacing
│       └── vitest.config.ts          # Vitest suite for native contracts
├── packages/
│   └── design-tokens/                # Shared design tokens (typography, colors, motion)
├── server/
│   └── fl/                           # Federated Learning server (FastAPI + Flower + Docker)
│       ├── src/attune_fl/            # FedAvg aggregation logic and endpoints
│       └── tests/                    # Pytest test suite for FL engine
├── legacy/
│   └── web/                          # Legacy Next.js web application (gaze algorithm source)
├── CREDITS.md                        # Third-party foundations and license attributions
├── AGENTS.md                         # Project engineering principles and execution rules
└── PLAN.md                           # Detailed product architecture and implementation plan
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.x` or higher
- **Android Studio & SDK**: Android 14+ (API 34/35) with `ANDROID_HOME` configured
- **Java**: JDK 17
- **Python**: `3.11+` (for testing the FL server)

---

### 1. Mobile App Setup (`apps/mobile`)

```bash
# Navigate to mobile directory
cd apps/mobile

# Install dependencies
npm install

# Run static checks and tests
npm run typecheck
npm test
npm run lint

# Generate native Android project files with local modules
npx expo prebuild --clean --platform android --no-install

# Launch on connected Android device or emulator
npm run android
```

#### Verifying Native Module Autolinking
Before building, ensure the local Kotlin module is detected by Expo:
```bash
npx expo-modules-autolinking resolve --platform android --json modules
```
The output should list `@attune/native` and `app.attune.attunenative.AttuneNativeModule`.

---

### 2. Federated Learning Server (`server/fl`)

The server aggregates numeric keyboard model updates using Federated Averaging (FedAvg):

```bash
# Navigate to FL server directory
cd server/fl

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt -r requirements-dev.txt

# Run test suite
pytest

# Start the server locally
uvicorn attune_fl.api:app --host 0.0.0.0 --port 8000 --reload
```

Or deploy using Docker Compose:
```bash
docker-compose up --build
```

---

## 🧪 Testing & Verification

The project includes unit test coverage across all major boundaries:

| Layer | Framework | Command | Coverage |
|---|---|---|---|
| **TypeScript Native Contract** | Vitest | `npm test` (in `apps/mobile`) | Native contract schemas, fallback handling, serialization |
| **Native Android / Kotlin** | JUnit 4 / Mockito | Gradle `testDebugUnitTest` | Ambient volume, attention classifier, DND policy, notification ranking |
| **Federated Learning Server** | Pytest | `pytest` (in `server/fl`) | API security, FedAvg aggregation, client thresholds, DP verification |

---

## 📜 Credits & Attributions

Attune builds upon open-source foundations and system platform APIs. Detailed licensing boundaries and attributions can be found in [CREDITS.md](CREDITS.md).

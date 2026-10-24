# AGENTS.md — "Same Phone, Just Smarter" (DTI prototype)

Read this first. It applies to every agent and sub-agent working in this repo.

## 1. What we are building
A working, installable prototype of the 5 ideas in `DTI_Smarter_Solutions.pptx`, unified as one product
following the deck's loop **Sense → Understand → Adapt → Protect → Care**:

| # | Feature (deck idea) | Core signal | Owner team |
|---|---|---|---|
| 1 | Smart group-chat notification ranking | sender + message text (NLP) + past response | Aman, Prince |
| 2 | Hinglish / code-switching keyboard, learns on-device (federated) | typing patterns | Riya, Shreya |
| 3 | Context-aware interruption (smart DND) | activity, calendar, location, app usage | Rahul, Yash |
| 4 | Attention-accurate screen time | front-camera gaze (+ fallbacks) | Tushar, Rakesh |
| 5 | Ambient-noise adaptive volume | microphone dB + environment type | Omprakash, Varshith |

Rules: follow the **ideas** in the deck strictly (no new features), but the implementation approach is ours.
**Android app only** (no website). Design comes first: the app must feel premium.
**Real, not demo:** real notifications, real DND, real volume, real system keyboard, real usage stats. No mock data or demo modes.
Everything sensitive runs **on-device**; no raw text/audio/video leaves the phone. See `PLAN.md` for the build plan.

## 2. Quality-first execution policy
There is no token-budget or model-routing restriction for this project. Prefer the strongest available reasoning and implementation capability for every task. Do not trade away correctness, security, native Android behavior, test coverage, or design quality for shorter output.

**Working style**
- Use sub-agents when they improve correctness, provide independent review, or allow genuinely parallel work. Give each one a self-contained scope and integrate their actual results.
- Use the best available model or agent for architecture, native Android lifecycle work, cross-feature behavior, debugging, and final review.
- Read the relevant source and project instructions before changing code. Avoid irrelevant generated output, dependency directories, build artifacts, and binary payloads unless the task requires them.
- Prefer proven open-source foundations over reimplementing difficult platform behavior (see `PLAN.md §4`). Verify licenses, versions, integration boundaries, and credit sources in `CREDITS.md`.
- Use authoritative, version-matched documentation for Expo, Android, Kotlin, and third-party libraries instead of relying on memory.
- Explain important architectural or privacy choices clearly, but spend the majority of effort on working code, tests, and verification.
- Keep temporary experiments and synthetic design data clearly separated from release behavior. Never present a mock as a real feature.

## 3. Repo layout (target)
```
/apps/mobile            Expo (React Native) Android app + Kotlin native modules (Expo Modules API)
/apps/keyboard          FlorisBoard fork → Attune Keyboard (Kotlin IME)
/server/fl              FastAPI + Flower FedAvg/DP server (Docker)
/packages/design-tokens shared colour/type/spacing/motion tokens (app + keyboard theme)
/models                 on-device models (tflite) + training notebooks
/legacy/web             old Next.js `trueattention` app; its gaze maths in lib/ is ported for Idea 4
/vendor                 cloned OSS repos (git-ignored, referenced only)
```

## 4. Engineering conventions
- TypeScript strict in RN, Kotlin for services. Logic that must run with the UI closed lives in Kotlin.
- Each feature follows the same shape: sense → understand → adapt, with its permissions and fallback documented.
- Every feature MUST degrade gracefully when a permission is denied (see `PLAN.md §6`). Never crash, never nag.
- Battery-aware: duty-cycle sensors, use hysteresis, and never poll in tight loops.
- Privacy card per feature: what is sensed, where it's stored, how to delete it.
- UI: only use design tokens (no raw colours or sizes), Reanimated + Skia for motion and visuals, haptics on state changes,
  dark and light themes. No 3D. Run the design-critique / polish skills on every new screen.
- Commit small, conventional messages (`feat(notify): ...`).

## 5. Definition of done
A feature is complete only when:
1. Its real Android signal is read.
2. Its real system action is performed.
3. Its permission-denied behavior works honestly.
4. Sensitive raw inputs stay on-device according to the privacy contract.
5. It survives the app UI being closed wherever Android permits it.
6. Meaningful unit/integration tests exist for its important boundaries.
7. The UI shows current source, confidence, status, and limitations.
8. It has been tested on a physical Android device when the feature depends on hardware or OS behavior.

## 6. Verification
- Unit tests (Jest for TS, JUnit for Kotlin) must pass.
- Verify on a real Android phone (or emulator) via `mobile-mcp`; screenshot each feature doing its real action.
- Report honestly what was and wasn't verified.

# Attune implementation credits

This prototype keeps external foundations isolated from product code and records the intended
license boundary before any model or fork is bundled.

| Foundation | Intended use | Status |
|---|---|---|
| Expo Modules API | Kotlin-to-React-Native bridge | Used through the local `@attune/native` module |
| Android `NotificationListenerService` / `NotificationManager` | Real notification access and DND policy | Native platform APIs |
| Android `InputMethodService` | Real Attune system keyboard | Native platform API; keyboard model is product code |
| Android `UsageStatsManager` | Usage-only screen-time baseline | Native platform API |
| Camera2 | Privacy-safe camera frame boundary | Native platform API; gaze model is not yet bundled |
| MediaPipe Face Landmarker | Planned on-device gaze landmarks | Not bundled yet; verify current license/version before adding |
| YAMNet | Planned on-device environment classification | Not bundled yet; verify model license/version before adding |
| Flower | Optional federated aggregation adapter | Optional server dependency; see `server/fl/README.md` |
| AI4Bharat IndicXlit | Planned romanized Indic transliteration seed | Not bundled yet; verify model/license before adding |

No raw notification text, typed text, audio, or camera frames are sent to the federated-learning
server. The server accepts only bounded numeric model updates.

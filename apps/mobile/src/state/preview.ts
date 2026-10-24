/**
 * DEV-ONLY design preview. Lets us review fully-populated screens before the native
 * services exist. Never loaded in release builds (guarded by __DEV__ at the call site).
 */
import { setState, initialState, type AttuneState } from './store';

const now = Date.now();
const min = 60_000;

export function loadDesignPreview() {
  if (!__DEV__) return;
  const preview: Partial<AttuneState> = {
    onboarded: true,
    permissions: Object.fromEntries(
      Object.keys(initialState.permissions).map((k) => [k, k === 'camera' ? 'denied' : 'granted']),
    ) as AttuneState['permissions'],
    features: {
      notify: { key: 'notify', enabled: true, mode: 'full', headline: '1 priority · 23 held for later', missing: [] },
      keyboard: { key: 'keyboard', enabled: true, mode: 'full', headline: '41 corrections avoided today', missing: [] },
      focus: { key: 'focus', enabled: true, mode: 'full', headline: 'On · Viva until 12:00', missing: [] },
      attention: { key: 'attention', enabled: true, mode: 'reduced', headline: '1h 52m real · 3h 10m screen-on', missing: ['camera'] },
      volume: { key: 'volume', enabled: true, mode: 'full', headline: 'Quiet room · ringer 20%', missing: [] },
    },
    dndActive: true,
    context: {
      at: now,
      place: 'college',
      activity: 'still',
      event: 'Viva — Data Structures',
      appCategory: null,
      noiseDb: 34,
      environment: 'quiet',
      interruptibility: 12,
      reasons: ['In a calendar event', 'Phone is still', 'On campus Wi-Fi'],
    },
    notifications: [
      { id: 'n1', app: 'WhatsApp', appPackage: 'com.whatsapp', sender: 'Prof. Mehta', conversation: 'CSE-A 2026', text: 'Exam hall changed to B-204, reporting 9:45 sharp.', postedAt: now - 4 * min, score: 0.94, tier: 'class', urgency: 0.91, verdict: 'priority', reasons: ['Time-sensitive', 'Exam', 'Class group'] },
      { id: 'n2', app: 'WhatsApp', appPackage: 'com.whatsapp', sender: 'Didi', conversation: null, text: 'call me when free, dadi ka checkup hai', postedAt: now - 11 * min, score: 0.88, tier: 'family', urgency: 0.62, verdict: 'priority', reasons: ['Family', 'Asks for a call'] },
      { id: 'n3', app: 'WhatsApp', appPackage: 'com.whatsapp', sender: 'Rohit', conversation: 'CSE-A 2026', text: '😂😂 this meme is literally us', postedAt: now - 6 * min, score: 0.08, tier: 'class', urgency: 0.02, verdict: 'digest', reasons: ['Low urgency'] },
      { id: 'n4', app: 'Instagram', appPackage: 'com.instagram.android', sender: 'Instagram', conversation: null, text: 'karan.03 and 4 others liked your reel', postedAt: now - 20 * min, score: 0.05, tier: 'unknown', urgency: 0.01, verdict: 'digest', reasons: ['Social'] },
      { id: 'n5', app: 'Telegram', appPackage: 'org.telegram.messenger', sender: 'Anjali', conversation: 'DTI Team', text: 'anyone have notes for unit 3?', postedAt: now - 32 * min, score: 0.31, tier: 'close', urgency: 0.2, verdict: 'digest', reasons: ['Question', 'Not urgent'] },
      { id: 'n6', app: 'Myntra', appPackage: 'com.myntra.android', sender: 'Myntra', conversation: null, text: 'FLAT 60% OFF ends tonight 🔥', postedAt: now - 45 * min, score: 0.02, tier: 'unknown', urgency: 0.1, verdict: 'digest', reasons: ['Promotion'] },
    ],
    keyboard: {
      wordsLearned: 312,
      correctionsAvoided: 41,
      keystrokesSaved: 1280,
      languageMix: { english: 0.46, hinglish: 0.51, other: 0.03 },
      federated: { joined: true, rounds: 14, modelVersion: 'hx-0.14', lastSync: now - 9 * 60 * min, epsilon: 2.1 },
    },
    focusLog: [
      { id: 'f1', at: now - 50 * min, action: 'dnd_on', reason: 'Viva started · calendar' },
      { id: 'f2', at: now - 31 * min, action: 'let_through', reason: 'Didi called twice · family' },
      { id: 'f3', at: now - 18 * min, action: 'held', reason: 'Sale alert · Myntra' },
      { id: 'f4', at: now - 3 * 60 * min, action: 'dnd_off', reason: 'Left library · walking' },
    ],
    attention: [
      {
        date: new Date(now).toISOString().slice(0, 10),
        screenOnMin: 190,
        attendedMin: 112,
        glances: 64,
        source: 'sensors',
        apps: [
          { appPackage: 'com.instagram.android', app: 'Instagram', screenOnMin: 52, attendedMin: 44, glanceMin: 6, passiveMin: 2 },
          { appPackage: 'com.google.android.apps.maps', app: 'Maps', screenOnMin: 38, attendedMin: 7, glanceMin: 3, passiveMin: 28 },
          { appPackage: 'com.whatsapp', app: 'WhatsApp', screenOnMin: 34, attendedMin: 27, glanceMin: 7, passiveMin: 0 },
          { appPackage: 'com.google.android.youtube', app: 'YouTube', screenOnMin: 31, attendedMin: 22, glanceMin: 1, passiveMin: 8 },
          { appPackage: 'com.android.deskclock', app: 'Clock', screenOnMin: 12, attendedMin: 0, glanceMin: 12, passiveMin: 0 },
        ],
        hourly: [0, 0, 0, 0, 0, 0, 2, 9, 14, 4, 1, 0, 6, 11, 8, 3, 5, 7, 10, 12, 9, 6, 4, 0],
      },
    ],
    volume: Array.from({ length: 36 }, (_, i) => {
      const db = 34 + Math.round(30 * Math.max(0, Math.sin(i / 5)) + (i % 4));
      return {
        at: now - (36 - i) * 10 * min,
        db,
        environment: db < 40 ? 'quiet' : db < 55 ? 'conversation' : db < 68 ? 'street' : 'transit',
        ringVolume: Math.min(1, Math.max(0.15, (db - 30) / 45)),
      } as const;
    }),
  };
  setState(preview);
}

export function clearDesignPreview() {
  // Keep hydration/onboarding so clearing the preview doesn't bounce the user back to onboarding.
  setState((s) => ({ ...initialState, hydrated: s.hydrated, onboarded: s.onboarded }));
}

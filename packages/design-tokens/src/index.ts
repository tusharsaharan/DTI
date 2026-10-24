/**
 * Attune design tokens — single source of truth for the app (RN) and the keyboard theme (Kotlin, via tokens.json).
 * Never use raw colours/sizes in UI code; import from here.
 */

export type FeatureKey = 'notify' | 'keyboard' | 'focus' | 'attention' | 'volume';

/** Primitive palette. Warm neutrals + one accent per feature. */
export const palette = {
  ink: {
    0: '#000000',
    50: '#0A0A0B',
    100: '#111113',
    150: '#17171A',
    200: '#1E1E22',
    300: '#2A2A30',
    400: '#3A3A42',
    500: '#5A5A63',
    600: '#82828B',
    700: '#A9A9B0',
    800: '#D2D1D4',
    900: '#ECEBE8',
    950: '#F6F5F1',
    1000: '#FFFFFF',
  },
  ember: { base: '#FF6A45', soft: '#FF6A4529', deep: '#C2411F', onLight: '#D9481F' },
  iris: { base: '#9C8CFF', soft: '#9C8CFF29', deep: '#5B47E0', onLight: '#5B47E0' },
  mint: { base: '#38D9B0', soft: '#38D9B029', deep: '#0F9E7A', onLight: '#0B8566' },
  sky: { base: '#5BB2FF', soft: '#5BB2FF29', deep: '#1F78D1', onLight: '#1769BA' },
  honey: { base: '#F5C451', soft: '#F5C45129', deep: '#C8921A', onLight: '#9A6C05' },
  danger: '#FF5A5F',
  success: '#38D9B0',
} as const;

const featurePrimitive = {
  notify: palette.ember,
  keyboard: palette.iris,
  focus: palette.mint,
  attention: palette.sky,
  volume: palette.honey,
} as const;

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceRaised: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  accent: string;
  onAccent: string;
  danger: string;
  success: string;
  scrim: string;
  feature: Record<FeatureKey, { base: string; soft: string; text: string }>;
}

export const colors: { dark: ThemeColors; light: ThemeColors } = {
  dark: {
    bg: palette.ink[50],
    bgElevated: palette.ink[100],
    surface: palette.ink[150],
    surfaceRaised: palette.ink[200],
    surfacePressed: palette.ink[300],
    border: '#FFFFFF12',
    borderStrong: '#FFFFFF24',
    text: palette.ink[950],
    textSecondary: palette.ink[700],
    textTertiary: palette.ink[500],
    textInverse: palette.ink[50],
    accent: palette.ink[950],
    onAccent: palette.ink[50],
    danger: palette.danger,
    success: palette.success,
    scrim: '#000000B3',
    feature: mapFeatures((p) => ({ base: p.base, soft: p.soft, text: p.base })),
  },
  light: {
    bg: palette.ink[950],
    bgElevated: palette.ink[1000],
    surface: palette.ink[1000],
    surfaceRaised: '#FBFAF7',
    surfacePressed: palette.ink[900],
    border: '#0A0A0B12',
    borderStrong: '#0A0A0B24',
    text: palette.ink[50],
    textSecondary: palette.ink[500],
    textTertiary: palette.ink[600],
    textInverse: palette.ink[950],
    accent: palette.ink[50],
    onAccent: palette.ink[950],
    danger: '#D93A3F',
    success: palette.mint.onLight,
    scrim: '#0A0A0B66',
    feature: mapFeatures((p) => ({ base: p.base, soft: p.soft, text: p.onLight })),
  },
};

function mapFeatures(
  fn: (p: (typeof featurePrimitive)[FeatureKey]) => { base: string; soft: string; text: string },
): ThemeColors['feature'] {
  return {
    notify: fn(featurePrimitive.notify),
    keyboard: fn(featurePrimitive.keyboard),
    focus: fn(featurePrimitive.focus),
    attention: fn(featurePrimitive.attention),
    volume: fn(featurePrimitive.volume),
  };
}

/** Font family names as registered by the app's font loader. */
export const fonts = {
  display: 'InterTight_600SemiBold',
  displayBold: 'InterTight_700Bold',
  displayLight: 'InterTight_300Light',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

/** Type scale: [fontSize, lineHeight, letterSpacing]. Display sizes are tight-tracked. */
export const type = {
  hero: { fontFamily: fonts.displayLight, fontSize: 64, lineHeight: 64, letterSpacing: -2.6 },
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 },
  title1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  title2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  title3: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  callout: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  calloutMedium: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: fonts.bodySemibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.4 },
  numeral: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 18, letterSpacing: -0.2 },
} as const;

export type TypeVariant = keyof typeof type;

/** 4pt spacing grid. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64, 11: 80 } as const;

export const radius = { xs: 8, sm: 12, md: 18, lg: 24, xl: 32, pill: 999 } as const;

/** Page gutters / layout constants. */
export const layout = { gutter: 20, cardPadding: 20, tabBarHeight: 72, maxContent: 560 } as const;

/** Motion: Reanimated spring configs + timing durations (ms). */
export const motion = {
  spring: {
    snappy: { damping: 22, stiffness: 320, mass: 0.8 },
    smooth: { damping: 26, stiffness: 180, mass: 1 },
    gentle: { damping: 30, stiffness: 110, mass: 1 },
    bouncy: { damping: 14, stiffness: 220, mass: 0.9 },
  },
  duration: { instant: 90, fast: 160, base: 240, slow: 420, ambient: 2400 },
  pressScale: 0.97,
  stagger: 55,
} as const;

/** Feature metadata shared by app + keyboard + notifications. Ideas follow the DTI deck strictly. */
export const features: Record<
  FeatureKey,
  { index: number; name: string; short: string; tagline: string; persona: string; team: string }
> = {
  notify: {
    index: 1,
    name: 'Priority Inbox',
    short: 'Inbox',
    tagline: 'The one message that matters, never buried again.',
    persona: 'Varun',
    team: 'Aman · Prince',
  },
  keyboard: {
    index: 2,
    name: 'Attune Keyboard',
    short: 'Keyboard',
    tagline: 'Type the way you speak. Hinglish included.',
    persona: 'Aryan',
    team: 'Riya · Shreya',
  },
  focus: {
    index: 3,
    name: 'Smart Focus',
    short: 'Focus',
    tagline: 'Do Not Disturb that knows your moment, not just the clock.',
    persona: 'Lakshya',
    team: 'Rahul · Yash',
  },
  attention: {
    index: 4,
    name: 'True Screen Time',
    short: 'Attention',
    tagline: 'Count the time you actually looked, not the time the screen was on.',
    persona: 'Vivek',
    team: 'Tushar · Rakesh',
  },
  volume: {
    index: 5,
    name: 'Ambient Volume',
    short: 'Volume',
    tagline: 'Always audible, never the loudest phone in the library.',
    persona: 'Shivam',
    team: 'Omprakash · Varshith',
  },
};

export const featureOrder: FeatureKey[] = ['notify', 'keyboard', 'focus', 'attention', 'volume'];

export const tokens = { palette, colors, fonts, type, space, radius, layout, motion, features, featureOrder };
export default tokens;

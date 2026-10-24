import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { router } from 'expo-router';
import { Blur, Canvas, Circle } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ArrowRight, Radio } from 'lucide-react-native';
import { fonts, layout, motion, radius, space, useTheme } from '@/theme';
import { useAttune } from '@/state/store';
import type { ContextSnapshot } from '@/state/types';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { PressableScale } from '@/ui/PressableScale';

const ORB = 132;

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '').slice(0, 6);
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** Linear mix of two #RRGGBB colours. */
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const ch = x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0'));
  return `#${ch.join('')}`;
}

const placeLabel: Record<ContextSnapshot['place'], string> = {
  home: 'At home',
  college: 'On campus',
  library: 'In the library',
  work: 'At work',
  transit: 'In transit',
  outside: 'Outdoors',
  unknown: 'Somewhere',
};
const activityLabel: Record<ContextSnapshot['activity'], string> = {
  still: 'still',
  walking: 'walking',
  running: 'running',
  vehicle: 'in a vehicle',
  cycling: 'cycling',
  unknown: '',
};

function sentence(ctx: ContextSnapshot): string {
  const parts = [ctx.event ?? placeLabel[ctx.place], activityLabel[ctx.activity]];
  if (ctx.environment) parts.push(`${ctx.environment} around you`);
  return parts.filter(Boolean).join(' · ');
}

function verdict(v: number): string {
  if (v < 25) return 'Only urgent gets through';
  if (v < 55) return 'Priority people get through';
  if (v < 80) return 'Most things get through';
  return 'Fully available';
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => live && setReduce(r)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function Orb({ color, level, still }: { color: string; level: number; still: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) {
      t.value = 0.5;
      return;
    }
    // Calmer breathing when less available.
    const dur = motion.duration.ambient * (1.4 - level / 200);
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [still, level, t]);

  const half = ORB / 2;
  const core = 20 + (level / 100) * 10;
  const haloR = useDerivedValue(() => half * (0.52 + t.value * 0.2));
  const haloBlur = useDerivedValue(() => 14 + t.value * 8);
  const haloOpacity = useDerivedValue(() => 0.35 + t.value * 0.25);
  const ringR = useDerivedValue(() => half * (0.38 + t.value * 0.06));
  const coreR = useDerivedValue(() => core + t.value * 2);

  return (
    <Canvas style={{ width: ORB, height: ORB }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={half} cy={half} r={haloR} color={color} opacity={haloOpacity}>
        <Blur blur={haloBlur} />
      </Circle>
      <Circle cx={half} cy={half} r={ringR} color={color} style="stroke" strokeWidth={1.5} opacity={0.5} />
      <Circle cx={half} cy={half} r={coreR} color={color}>
        <Blur blur={1.5} />
      </Circle>
    </Canvas>
  );
}

/** The signature Context Engine card: a living read of how interruptible you are right now. */
export function ContextCard() {
  const { c, feature } = useTheme();
  const ctx = useAttune((s) => s.context);
  const reduce = useReduceMotion();
  const mint = feature('focus');
  const ember = feature('notify');

  const level = ctx?.interruptibility ?? 0;
  const orbColor = useMemo(() => mix(ember.base, mint.base, level / 100), [ember.base, mint.base, level]);
  const textColor = useMemo(() => mix(ember.text, mint.text, level / 100), [ember.text, mint.text, level]);

  const frame = {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: layout.cardPadding + 2,
    overflow: 'hidden' as const,
  };

  if (!ctx) {
    return (
      <View style={[frame, { gap: space[4] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Radio size={16} color={c.textTertiary} strokeWidth={1.9} />
          <Text variant="overline" uppercase tone="tertiary">
            Right now
          </Text>
        </View>
        <Text variant="title1">Attune is listening for context</Text>
        <Text variant="callout" tone="secondary">
          Once calendar, motion and place are connected, this card shows how interruptible you are and why.
        </Text>
        <PressableScale
          accessibilityLabel="Finish setup"
          onPress={() => router.push('/onboarding')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: 'flex-start', paddingVertical: space[1] }}
        >
          <Text variant="bodyMedium">Finish setup</Text>
          <ArrowRight size={18} color={c.text} strokeWidth={1.9} />
        </PressableScale>
      </View>
    );
  }

  return (
    <View
      style={frame}
      accessible
      accessibilityLabel={`Interruptibility ${level} out of 100. ${sentence(ctx)}. ${verdict(level)}.`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: orbColor }} />
        <Text variant="overline" uppercase tone="tertiary">
          Right now
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[2] }}>
        <View style={{ flex: 1, paddingRight: space[2] }}>
          <Text
            style={{ fontFamily: fonts.mono, fontSize: 72, lineHeight: 76, letterSpacing: -3, color: textColor }}
            allowFontScaling={false}
          >
            {level}
          </Text>
          <Text variant="overline" uppercase tone="tertiary">
            Interruptibility
          </Text>
        </View>
        <View style={{ marginRight: -space[3] }}>
          <Orb color={orbColor} level={level} still={reduce} />
        </View>
      </View>

      <View style={{ marginTop: space[4], gap: space[1] }}>
        <Text variant="title2">{verdict(level)}</Text>
        <Text variant="callout" tone="secondary">
          {sentence(ctx)}
        </Text>
      </View>

      {ctx.reasons.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] }}>
          {ctx.reasons.map((r) => (
            <Chip key={r} label={r} />
          ))}
        </View>
      )}
    </View>
  );
}

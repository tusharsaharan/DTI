import { useEffect, useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Headphones, Minus, Mic, MicOff, Plus, Volume2 } from 'lucide-react-native';
import { fonts, layout, radius, space, useTheme } from '@/theme';
import { Card, EmptyState, PressableScale, PrivacyCard, Reveal, Row, Screen, SectionHeader, Sparkline, Switch, Text } from '@/ui';
import { FeatureHero, featureEyebrow } from '@/components/FeatureHero';
import { useAttune } from '@/state/store';
import { openPermissionSettings, permissionList } from '@/state/permissionInfo';
import { haptic } from '@/lib/haptics';
import { percent } from '@/lib/format';
import type { NoiseEnvironment } from '@/state/types';
import { getAttuneNative } from '../../../modules/attune-native';

const ENV_LABEL: Record<NoiseEnvironment, string> = {
  quiet: 'Quiet room',
  conversation: 'Conversation',
  street: 'Street',
  transit: 'Transit',
  music: 'Music',
  unknown: 'Environment not classified',
};

const DB_LO = 30;
const DB_HI = 90;
const mic = permissionList.find((p) => p.key === 'microphone')!;

export default function VolumeScreen() {
  const { c, feature } = useTheme();
  const accent = feature('volume');
  const { width } = useWindowDimensions();
  const samples = useAttune((s) => s.volume);
  const micStatus = useAttune((s) => s.permissions.microphone);
  const [minVol, setMinVol] = useState(0.15);
  const [maxVol, setMaxVol] = useState(0.9);
  const [leaveHeadphones, setLeaveHeadphones] = useState(true);

  useEffect(() => {
    const native = getAttuneNative();
    if (!native) return;
    void native.getAmbientConfig().then((config) => {
      if (typeof config.minVolumeFraction === 'number') setMinVol(config.minVolumeFraction);
      if (typeof config.maxVolumeFraction === 'number') setMaxVol(config.maxVolumeFraction);
      if (typeof config.leaveHeadphonesAlone === 'boolean') setLeaveHeadphones(config.leaveHeadphonesAlone);
    }).catch(() => {});
  }, []);

  const saveConfig = async (nextMin: number, nextMax: number, nextHeadphones: boolean) => {
    const native = getAttuneNative();
    if (!native) return true;
    const saved = await native.setAmbientConfig(nextMin, nextMax, nextHeadphones).catch(() => false);
    if (!saved) {
      setMinVol(minVol);
      setMaxVol(maxVol);
      setLeaveHeadphones(leaveHeadphones);
    }
    return saved;
  };

  const last = samples.length ? samples[samples.length - 1] : null;
  const inner = Math.min(width, layout.maxContent) - layout.gutter * 2 - layout.cardPadding * 2 - 2;

  return (
    <Screen
      title="Ambient Volume"
      eyebrow={featureEyebrow('volume')}
      eyebrowColor={accent.text}
      back
      bottomInset={space[4]}
      hero={
        <FeatureHero feature="volume" onGrant={() => openPermissionSettings(mic)} personaNote="whose phone rang loudest in the quietest room">
          <View style={{ marginTop: space[5] }} accessible accessibilityLabel={last ? `${last.db} decibels, ${ENV_LABEL[last.environment]}` : 'No noise reading yet'}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
              <Text
                variant="hero"
                color={last ? accent.text : c.textTertiary}
                style={{ fontFamily: fonts.mono, fontSize: 72, lineHeight: 76, letterSpacing: -3 }}
              >
                {last ? Math.round(last.db) : '--'}
              </Text>
              <Text variant="title3" tone="tertiary">
                dB
              </Text>
            </View>
            <Text variant="bodyMedium" tone="secondary">
              {last ? `${ENV_LABEL[last.environment]} · ringer ${percent(last.ringVolume)}` : 'Waiting for the first reading'}
            </Text>
          </View>
        </FeatureHero>
      }
    >
      {micStatus === 'denied' && (
        <Reveal index={1}>
          <Card tint={accent.soft}>
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
              <MicOff size={20} color={accent.text} strokeWidth={1.9} />
              <View style={{ flex: 1, gap: space[1] }}>
                <Text variant="bodyMedium">Using your place instead</Text>
                <Text variant="callout" tone="secondary">
                  Without the microphone, the ringer follows where you are: library = quiet, street = louder.
                </Text>
              </View>
            </View>
          </Card>
        </Reveal>
      )}

      <SectionHeader title="Noise and ringer" />
      <Reveal index={2}>
        <Card>
          {samples.length > 1 ? (
            <View accessible accessibilityLabel="Noise level over time with the ringer volume line">
              <View style={{ width: inner, height: 120 }}>
                <Sparkline data={samples.map((s) => s.db)} width={inner} height={120} color={accent.base} min={DB_LO} max={DB_HI} />
                <View style={{ position: 'absolute' }}>
                  <Sparkline data={samples.map((s) => s.ringVolume)} width={inner} height={120} color={c.textTertiary} min={0} max={1} fill={false} strokeWidth={1.5} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: space[4], marginTop: space[3] }}>
                <Key color={accent.base} label="Room noise" />
                <Key color={c.textTertiary} label="Ringer level" />
              </View>
            </View>
          ) : (
            <EmptyState
              icon={<Mic size={26} color={accent.base} strokeWidth={1.9} />}
              title="No readings yet"
              body="Every half minute or so Attune listens for one second and notes how loud the room is. The trace builds up here."
            />
          )}
        </Card>
      </Reveal>

      <SectionHeader title="Noise to volume" />
      <Reveal index={3}>
        <Card>
          <CurveView width={inner} min={minVol} max={maxVol} now={last?.db ?? null} color={accent.base} />
          <Text variant="callout" tone="secondary" style={{ marginTop: space[3] }}>
            The quieter the room, the lower the ringer, never below your minimum or above your maximum.
          </Text>
        </Card>
      </Reveal>

      <Reveal index={4}>
        <Card>
          <Stepper label="Minimum ringer" value={minVol} lo={0.05} hi={maxVol - 0.05} onChange={(next) => { setMinVol(next); void saveConfig(next, maxVol, leaveHeadphones); }} color={accent.text} />
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: space[3] }} />
          <Stepper label="Maximum ringer" value={maxVol} lo={minVol + 0.05} hi={1} onChange={(next) => { setMaxVol(next); void saveConfig(minVol, next, leaveHeadphones); }} color={accent.text} />
        </Card>
      </Reveal>

      <Reveal index={5}>
        <Card>
          <Row
            last
            icon={<Headphones size={18} color={c.text} strokeWidth={1.9} />}
            title="Headphones: leave volume alone"
            subtitle="Attune never changes volume while headphones are connected."
            trailing={<Switch value={leaveHeadphones} onChange={(next) => { setLeaveHeadphones(next); void saveConfig(minVol, maxVol, next); }} color={accent.base} accessibilityLabel="Leave volume alone with headphones" />}
          />
        </Card>
      </Reveal>

      <Reveal index={6}>
        <PrivacyCard
          senses="Room loudness, one second at a time, and a label like quiet or street."
          stays="Audio lives in memory for one second. Only the dB number and the label are kept, on this phone."
          never="Recordings, speech or anything anyone said."
        />
      </Reveal>
    </Screen>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function Stepper({ label, value, lo, hi, onChange, color }: { label: string; value: number; lo: number; hi: number; onChange: (v: number) => void; color: string }) {
  const { c } = useTheme();
  const step = (d: number) => {
    const next = Math.round(Math.min(hi, Math.max(lo, value + d)) * 100) / 100;
    if (next !== value) {
      haptic.tap();
      onChange(next);
    }
  };
  const btn = { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="bodyMedium">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <PressableScale accessibilityLabel={`Decrease ${label}`} haptics={false} onPress={() => step(-0.05)} style={btn}>
          <Minus size={18} color={c.text} strokeWidth={2} />
        </PressableScale>
        <Text variant="title3" color={color} tabular style={{ minWidth: 52, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {percent(value)}
        </Text>
        <PressableScale accessibilityLabel={`Increase ${label}`} haptics={false} onPress={() => step(0.05)} style={btn}>
          <Plus size={18} color={c.text} strokeWidth={2} />
        </PressableScale>
      </View>
    </View>
  );
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function CurveView({ width, min, max, now, color }: { width: number; min: number; max: number; now: number | null; color: string }) {
  const { c } = useTheme();
  const H = 110;
  const pad = 8;
  const X = (db: number) => pad + ((db - DB_LO) / (DB_HI - DB_LO)) * (width - pad * 2);
  const Y = (v: number) => H - pad - v * (H - pad * 2);
  const vol = (db: number) => min + (max - min) * smooth((db - 40) / 30);

  const path = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    for (let db = DB_LO; db <= DB_HI; db += 2) {
      if (db === DB_LO) p.moveTo(X(db), Y(vol(db)));
      else p.lineTo(X(db), Y(vol(db)));
    }
    return p.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, min, max]);

  const floor = useMemo(() => Skia.PathBuilder.Make().moveTo(pad, Y(0)).lineTo(width - pad, Y(0)).build(), [width]);

  return (
    <View accessible accessibilityLabel={`Ringer ranges from ${percent(min)} in quiet rooms to ${percent(max)} in loud places`}>
      <Canvas style={{ width, height: H }}>
        <Path path={floor} style="stroke" strokeWidth={1} color={c.border} />
        <Path path={path} style="stroke" strokeWidth={3} color={color} strokeCap="round" strokeJoin="round" />
        <Circle cx={X(DB_LO)} cy={Y(min)} r={6} color={c.bg} />
        <Circle cx={X(DB_LO)} cy={Y(min)} r={4} color={color} />
        <Circle cx={X(DB_HI)} cy={Y(max)} r={6} color={c.bg} />
        <Circle cx={X(DB_HI)} cy={Y(max)} r={4} color={color} />
        {now !== null && <Circle cx={X(Math.min(DB_HI, Math.max(DB_LO, now)))} cy={Y(vol(now))} r={5} color={c.text} />}
      </Canvas>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="tertiary">
          {DB_LO} dB · quiet
        </Text>
        <Volume2 size={14} color={c.textTertiary} strokeWidth={1.9} />
        <Text variant="caption" tone="tertiary">
          {DB_HI} dB · loud
        </Text>
      </View>
    </View>
  );
}

import { View } from 'react-native';
import { Camera, Check, Eye } from 'lucide-react-native';
import { layout, radius, space, useTheme } from '@/theme';
import { Button, Card, EmptyState, PrivacyCard, Reveal, Screen, SectionHeader, Text } from '@/ui';
import { FeatureHero, featureEyebrow } from '@/components/FeatureHero';
import { Ring } from '@/ui/Ring';
import { useAttune } from '@/state/store';
import { minutes } from '@/lib/format';
import { openPermissionSettings, permissionList } from '@/state/permissionInfo';
import type { AttentionSource } from '@/state/types';

const APPROACHES: { source: AttentionSource; name: string; line: string }[] = [
  { source: 'camera', name: 'Camera frame boundary', line: 'Permission and privacy plumbing are ready; gaze inference is not claimed until the on-device model is installed.' },
  { source: 'hybrid', name: 'Hybrid calibration', line: 'Planned next: short opt-in camera calibration followed by an on-device sensor model.' },
  { source: 'sensors', name: 'Sensors only', line: 'Planned fallback: interaction, motion, proximity and activity signals without camera.' },
  { source: 'usage', name: 'Usage baseline', line: 'Available now. Android foreground time is shown with low confidence and no gaze claim.' },
];

const camera = permissionList.find((p) => p.key === 'camera')!;

export default function AttentionScreen() {
  const { c, feature } = useTheme();
  const accent = feature('attention');
  const day = useAttune((s) => s.attention[0] ?? null);
  const missing = useAttune((s) => s.features.attention.missing);

  const grant = () => {
    const first = permissionList.find((p) => missing.includes(p.key)) ?? camera;
    openPermissionSettings(first);
  };

  const hasData = !!day && day.screenOnMin > 0;
  const hasGazeData = day?.source === 'camera' || day?.source === 'hybrid' || day?.source === 'sensors';
  const maxHour = day ? Math.max(1, ...day.hourly) : 1;
  const barW = (min: number, total: number) => `${Math.max(0, Math.min(100, (min / Math.max(total, 1)) * 100))}%` as const;

  return (
    <Screen
      title="True Screen Time"
      eyebrow={featureEyebrow('attention')}
      eyebrowColor={accent.text}
      back
      hero={
        <FeatureHero feature="attention" onGrant={grant} personaNote="whose report counted every glance at the clock">
          {hasData ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[5], marginTop: space[5] }}>
              <Ring
                size={132}
                stroke={12}
                progress={day.attendedMin / Math.max(day.screenOnMin, 1)}
                ghost={1}
                color={accent.base}
              >
                <Eye size={26} color={accent.base} strokeWidth={1.9} />
              </Ring>
              <View style={{ flex: 1, gap: space[3] }}>
                <View>
                  <Text variant="overline" tone="tertiary" uppercase>
                    Android says
                  </Text>
                  <Text variant="title1" tone="secondary" tabular>
                    {minutes(day.screenOnMin)}
                  </Text>
                </View>
                <View>
                    <Text variant="overline" color={accent.text} uppercase>
                     {hasGazeData ? 'You really looked' : 'Foreground estimate'}
                  </Text>
                  <Text
                    variant="display"
                    tabular
                    accessibilityLabel={hasGazeData ? `You really looked ${minutes(day.attendedMin)}` : `Android foreground estimate ${minutes(day.screenOnMin)}`}
                  >
                    {minutes(hasGazeData ? day.attendedMin : day.screenOnMin)}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </FeatureHero>
      }
      bottomInset={space[4]}
    >
      {!hasData && (
        <Reveal index={1}>
          <Card>
            <EmptyState
              icon={<Eye size={26} color={accent.base} strokeWidth={1.9} />}
              title="Nothing measured yet"
              body="Once Usage access is on and the screen has been used, you will see how much of it you actually looked at, side by side with what Android reports."
            />
          </Card>
        </Reveal>
      )}

      <SectionHeader title="Through the day" />
      <Reveal index={2}>
        <Card>
          {day && day.hourly.some((v) => v > 0) ? (
            <View accessible accessibilityLabel="Attended minutes per hour across the day">
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 88, gap: 3 }}>
                {day.hourly.map((v, h) => (
                  <View key={h} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                    <View
                      style={{
                        height: v > 0 ? Math.max(4, (v / maxHour) * 88) : 3,
                        borderRadius: 3,
                        backgroundColor: v > 0 ? accent.base : c.surfacePressed,
                      }}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space[2] }}>
                {['12a', '6a', '12p', '6p', '11p'].map((t) => (
                  <Text key={t} variant="caption" tone="tertiary">
                    {t}
                  </Text>
                ))}
              </View>
            </View>
          ) : (
            <EmptyState title="No hours yet" body="Attended minutes appear here hour by hour as the day goes on." />
          )}
        </Card>
      </Reveal>

      <SectionHeader title="By app" />
      <Reveal index={3}>
        <Card>
          {day && day.apps.length > 0 ? (
            <View style={{ gap: space[5] }}>
              <View style={{ flexDirection: 'row', gap: space[4] }}>
                <Legend color={accent.base} label="Attended" />
                <Legend color={accent.soft} label="Glance" />
                <Legend color={c.surfacePressed} label="Passive" />
              </View>
              {day.apps.map((a) => (
                <View
                  key={a.appPackage}
                  style={{ gap: space[2] }}
                  accessible
                  accessibilityLabel={`${a.app}: ${minutes(a.attendedMin)} attended, ${minutes(a.glanceMin)} glance, ${minutes(a.passiveMin)} passive`}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text variant="bodyMedium">{a.app}</Text>
                    <Text variant="numeral" tone="secondary">
                      {minutes(a.attendedMin)} / {minutes(a.screenOnMin)}
                    </Text>
                  </View>
                  <View style={{ height: 8, flexDirection: 'row', borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.surfaceRaised }}>
                    <View style={{ width: barW(a.attendedMin, a.screenOnMin), backgroundColor: accent.base }} />
                    <View style={{ width: barW(a.glanceMin, a.screenOnMin), backgroundColor: accent.soft }} />
                    <View style={{ width: barW(a.passiveMin, a.screenOnMin), backgroundColor: c.surfacePressed }} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState title="No apps yet" body="Each app will show how much of its time was real attention, a quick glance, or passive." />
          )}
        </Card>
      </Reveal>

      <SectionHeader title="How we measure" />
      <Reveal index={4}>
        <Card padded={false}>
          {APPROACHES.map((a, n) => {
            const active = day?.source === a.source;
            return (
              <View
                key={a.source}
                accessible
                accessibilityLabel={`${a.name}${active ? ', active' : ''}. ${a.line}`}
                style={{
                  padding: layout.cardPadding,
                  gap: space[1],
                  backgroundColor: active ? accent.soft : undefined,
                  borderBottomWidth: n === APPROACHES.length - 1 ? 0 : 1,
                  borderBottomColor: c.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {a.name}
                  </Text>
                  {active && <Check size={18} color={accent.text} strokeWidth={2.2} />}
                </View>
                <Text variant="callout" tone="secondary">
                  {a.line}
                </Text>
              </View>
            );
          })}
        </Card>
      </Reveal>
      <Reveal index={5}>
        <Button
          label="Camera permission settings"
          variant="secondary"
          full
          icon={<Camera size={18} color={c.text} strokeWidth={1.9} />}
          onPress={() => openPermissionSettings(camera)}
        />
      </Reveal>

      <Reveal index={6}>
        <PrivacyCard
          senses="Which apps are on screen, how you hold the phone, and optionally your gaze during calibration."
          stays="Only minute totals per app and hour, on this phone."
          never="Photos, video or frames. They are read in memory and dropped."
        />
      </Reveal>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

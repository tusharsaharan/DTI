import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BarChart3, Eye, Moon } from 'lucide-react-native';
import { fonts, radius, space, useTheme } from '@/theme';
import { useAttune } from '@/state/store';
import { minutes, percent } from '@/lib/format';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Text } from '@/ui/Text';
import { Ring } from '@/ui/Ring';
import { SectionHeader, EmptyState } from '@/ui/Section';
import { TAB_BAR_SPACE } from '@/components/TabBar';
import type { FocusEvent, VolumeSample } from '@/state/types';

/** Minutes the phone spent in Do Not Disturb, from the on/off log. */
function dndMinutes(log: FocusEvent[], active: boolean, now: number): number {
  const edges = log.filter((e) => e.action === 'dnd_on' || e.action === 'dnd_off').sort((a, b) => a.at - b.at);
  let total = 0;
  let onAt: number | null = null;
  for (const e of edges) {
    if (e.action === 'dnd_on') onAt ??= e.at;
    else if (onAt !== null) {
      total += e.at - onAt;
      onAt = null;
    }
  }
  if (onAt !== null && active) total += now - onAt;
  return total / 60000;
}

function volumeChanges(v: VolumeSample[]): number {
  let n = 0;
  for (let i = 1; i < v.length; i++) if (Math.abs(v[i].ringVolume - v[i - 1].ringVolume) >= 0.05) n++;
  return n;
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: space[1] }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 34, lineHeight: 38, letterSpacing: -1.2 }} color={color} allowFontScaling={false}>
        {value}
      </Text>
      <Text variant="callout" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function Hairline() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border, marginVertical: space[5] }} />;
}

export default function Week() {
  const { c, feature } = useTheme();
  const attention = useAttune((s) => s.attention);
  const notifications = useAttune((s) => s.notifications);
  const focusLog = useAttune((s) => s.focusLog);
  const dndActive = useAttune((s) => s.dndActive);
  const volume = useAttune((s) => s.volume);
  const keyboard = useAttune((s) => s.keyboard);
  const [now] = useState(() => Date.now());

  const day = attention.length ? attention[0] : null;
  const hasGazeData = day?.source === 'camera' || day?.source === 'hybrid' || day?.source === 'sensors';
  const sky = feature('attention');
  const ember = feature('notify');
  const mint = feature('focus');
  const honey = feature('volume');
  const iris = feature('keyboard');

  const priority = notifications.filter((n) => n.verdict === 'priority').length;
  const held = notifications.filter((n) => n.verdict === 'digest').length;
  const dnd = useMemo(() => dndMinutes(focusLog, dndActive, now), [focusLog, dndActive, now]);
  const letThrough = focusLog.filter((e) => e.action === 'let_through').length;
  const adaptations = useMemo(() => volumeChanges(volume), [volume]);

  const hourlyMax = day ? Math.max(...day.hourly, 1) : 1;
  const peakHour = day ? day.hourly.indexOf(Math.max(...day.hourly)) : -1;
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

  return (
    <Screen title="Your day, kindly" eyebrow="Care" bottomInset={TAB_BAR_SPACE}>
      {/* Attention */}
      <Reveal index={0}>
        {day && day.screenOnMin > 0 ? (
          <View style={{ gap: space[5] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[5] }}>
              <Ring
                size={132}
                stroke={12}
                progress={day.attendedMin / day.screenOnMin}
                color={sky.base}
                ghost={1}
                ghostColor={c.borderStrong}
              >
                <Text style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: -0.8 }} allowFontScaling={false}>
                  {percent((hasGazeData ? day.attendedMin : day.screenOnMin) / day.screenOnMin)}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {hasGazeData ? 'attended' : 'foreground'}
                </Text>
              </Ring>
              <View style={{ flex: 1, gap: space[2] }}>
                 <Text variant="title2">{hasGazeData ? `You looked at your phone for ${minutes(day.attendedMin)}.` : `Android foreground time was ${minutes(day.screenOnMin)}.`}</Text>
                 <Text variant="callout" tone="secondary">
                   {hasGazeData ? `The other ${minutes(Math.max(0, day.screenOnMin - day.attendedMin))} was the screen being on.` : 'This is a usage baseline, not a gaze measurement.'}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="tertiary">
              {hasGazeData ? 'Measured with on-device attention signals, on this phone only.' : 'Android foreground time only; no gaze measurement is claimed.'}
            </Text>
          </View>
        ) : (
          <EmptyState
            icon={<Eye size={22} color={sky.base} strokeWidth={1.9} />}
            title="No attention data yet"
            body="Once True Screen Time has a day of data, you will see how much of your screen time was really you looking."
          />
        )}
      </Reveal>

      {/* Hourly */}
      <Reveal index={1}>
        <SectionHeader title="When you were looking" />
        {day && day.hourly.some((h) => h > 0) ? (
          <View style={{ marginTop: space[4], gap: space[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 3 }}>
              {day.hourly.map((m, h) => (
                <View
                  key={h}
                  style={{
                    flex: 1,
                    height: Math.max(3, (m / hourlyMax) * 96),
                    borderRadius: radius.xs / 2,
                    backgroundColor: h === peakHour ? sky.base : m > 0 ? sky.soft : c.surfacePressed,
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[0, 6, 12, 18].map((h) => (
                <Text key={h} variant="caption" tone="tertiary">
                  {hourLabel(h)}
                </Text>
              ))}
              <Text variant="caption" tone="tertiary">
                12am
              </Text>
            </View>
            <Text variant="callout" tone="secondary">
              Your busiest hour was {hourLabel(peakHour)}, with {minutes(day.hourly[peakHour])} of real attention.
            </Text>
          </View>
        ) : (
          <EmptyState
            icon={<BarChart3 size={22} color={c.textTertiary} strokeWidth={1.9} />}
            title="Nothing to chart yet"
            body="Hour-by-hour attention appears here after your first day."
          />
        )}
      </Reveal>

      {/* Protected */}
      <Reveal index={2}>
        <SectionHeader title="What Attune held back" />
        <View style={{ marginTop: space[4] }}>
          {notifications.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', gap: space[4] }}>
                <Stat value={String(held)} label="held for later" color={ember.text} />
                <Stat value={String(priority)} label="let through as priority" />
              </View>
              {held > 0 && (
                <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space[4], backgroundColor: c.surfacePressed }}>
                  <View style={{ flex: held, backgroundColor: ember.soft }} />
                  <View style={{ flex: Math.max(priority, 0.0001), backgroundColor: ember.base }} />
                </View>
              )}
            </>
          ) : (
            <EmptyState
              title="No notifications ranked yet"
              body="When messages arrive, you will see how many were held for later and which ones broke through."
            />
          )}
        </View>
      </Reveal>

      <Reveal index={3}>
        <Hairline />
        {focusLog.length > 0 && dnd > 0 ? (
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            <Stat value={minutes(dnd)} label="of quiet, on its own" color={mint.text} />
            <Stat value={String(letThrough)} label={letThrough === 1 ? 'call let through' : 'calls let through'} />
          </View>
        ) : (
          <EmptyState
            icon={<Moon size={22} color={mint.base} strokeWidth={1.9} />}
            title="No quiet time logged"
            body="Smart Focus turns Do Not Disturb on and off for you. The minutes it protects will add up here."
          />
        )}
      </Reveal>

      <Reveal index={4}>
        <Hairline />
        <View style={{ flexDirection: 'row', gap: space[4] }}>
          {volume.length > 1 ? (
            <Stat value={String(adaptations)} label="ringer adjustments to your surroundings" color={honey.text} />
          ) : (
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="title3">No volume changes yet</Text>
              <Text variant="callout" tone="secondary">
                Ambient Volume will log each time your ringer adapts to the room.
              </Text>
            </View>
          )}
        </View>
      </Reveal>

      <Reveal index={5}>
        <Hairline />
        {keyboard ? (
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            <Stat value={String(keyboard.correctionsAvoided)} label="typos you did not have to fix" color={iris.text} />
            <Stat value={String(keyboard.keystrokesSaved)} label="keystrokes saved" />
          </View>
        ) : (
          <View style={{ gap: space[1] }}>
            <Text variant="title3">The keyboard is still learning you</Text>
            <Text variant="callout" tone="secondary">
              Corrections avoided and keystrokes saved show up once you have typed with Attune Keyboard.
            </Text>
          </View>
        )}
      </Reveal>
    </Screen>
  );
}

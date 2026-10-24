import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { BellOff, BellRing, Calendar, Clock3, MapPin, Moon, Pause, Smartphone, Undo2, Footprints, type LucideIcon } from 'lucide-react-native';
import { palette, radius, space, useTheme } from '@/theme';
import { Card, EmptyState, PressableScale, PrivacyCard, Reveal, Ring, Screen, SectionHeader, Switch, Text } from '@/ui';
import { FeatureHero, featureEyebrow } from '@/components/FeatureHero';
import { setState, useAttune } from '@/state/store';
import { getAttuneNative } from '../../../modules/attune-native';
import { clock } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { FocusEvent, PermissionKey, PermissionStatus } from '@/state/types';

const EVENT: Record<FocusEvent['action'], { icon: LucideIcon; label: string }> = {
  dnd_on: { icon: Moon, label: 'Do Not Disturb on' },
  dnd_off: { icon: BellRing, label: 'Do Not Disturb off' },
  let_through: { icon: BellRing, label: 'Let through' },
  held: { icon: Pause, label: 'Held' },
};

const PERM_LABEL: Record<PermissionStatus, string> = { granted: 'Allowed', denied: 'Not allowed', unknown: 'Not asked' };

function grant() {
  const fallback = () => Linking.openSettings().catch(() => {});
  try {
    Linking.sendIntent('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS').catch(fallback);
  } catch {
    fallback();
  }
}

export default function FocusScreen() {
  const { c, feature } = useTheme();
  const a = feature('focus');
  const dnd = useAttune((s) => s.dndActive);
  const ctx = useAttune((s) => s.context);
  const log = useAttune((s) => s.focusLog);
  const perms = useAttune((s) => s.permissions);
  const [rules, setRules] = useState({ priority: true, starred: true, repeat: true });

  const score = ctx ? Math.max(0, Math.min(100, ctx.interruptibility)) : null;
  const ringColor = score !== null && score < 40 ? palette.ember.base : a.base;
  const sorted = [...log].sort((x, y) => y.at - x.at);
  const undoable = sorted.find((e) => e.action === 'dnd_on' || e.action === 'dnd_off');

  const undo = () => {
    if (!undoable) return;
    haptic.toggle();
    const turnOn = undoable.action === 'dnd_off';
    setState((s) => ({
      dndActive: turnOn,
      focusLog: [...s.focusLog, { id: `undo-${Date.now()}`, at: Date.now(), action: turnOn ? 'dnd_on' : 'dnd_off', reason: 'You undid the last change' }],
    }));
    const native = getAttuneNative();
    if (native) void native.applyDnd(turnOn, rules.priority && rules.starred, rules.repeat);
  };

  const changeRule = (key: keyof typeof rules, value: boolean) => {
    const next = { ...rules, [key]: value };
    setRules(next);
    const native = getAttuneNative();
    if (native && dnd) void native.applyDnd(true, next.priority && next.starred, next.repeat);
  };

  const signals: { icon: LucideIcon; label: string; value: string | null; perm: PermissionKey }[] = [
    { icon: Footprints, label: 'Activity', value: ctx && ctx.activity !== 'unknown' ? ctx.activity : null, perm: 'activityRecognition' },
    { icon: Calendar, label: 'Calendar', value: ctx?.event ?? null, perm: 'calendar' },
    { icon: MapPin, label: 'Place', value: ctx && ctx.place !== 'unknown' ? ctx.place : null, perm: 'location' },
    { icon: Smartphone, label: 'App in use', value: ctx?.appCategory ?? null, perm: 'usageAccess' },
  ];

  return (
    <Screen back title="Smart Focus" eyebrow={featureEyebrow('focus')} eyebrowColor={a.text} hero={<FeatureHero feature="focus" onGrant={grant} personaNote="and everyone with a lecture, a deadline and a phone that will not stop" />}>
      <Reveal>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[5] }}>
            <Ring size={112} stroke={9} progress={score === null ? 0 : score / 100} color={ringColor}>
              <Text variant="title1" tabular accessibilityLabel={score === null ? 'Interruptibility unknown' : `Interruptibility ${score} of 100`}>
                {score === null ? '--' : Math.round(score)}
              </Text>
            </Ring>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text variant="overline" tone="tertiary" uppercase>
                Do Not Disturb
              </Text>
              <Text variant="display" color={dnd ? a.text : undefined}>
                {dnd ? 'On' : 'Off'}
              </Text>
              <Text variant="caption" tone="secondary">
                {score === null ? 'Waiting for context' : 'Interruptibility, 0 to 100'}
              </Text>
            </View>
          </View>
          {ctx && ctx.reasons.length > 0 ? (
            <View style={{ marginTop: space[5], gap: space[2] }}>
              {ctx.reasons.map((r) => (
                <View key={r} style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: a.base }} />
                  <Text variant="callout" tone="secondary" style={{ flex: 1 }}>
                    {r}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="callout" tone="tertiary" style={{ marginTop: space[5] }}>
              Reasons will appear here as Attune senses your moment.
            </Text>
          )}
        </Card>
      </Reveal>

      <SectionHeader title="Let through" />
      <Reveal index={1}>
        <Card>
          <RuleRow title="Priority Inbox alerts" sub="Messages Attune ranks as urgent" value={rules.priority} onChange={(v) => changeRule('priority', v)} color={a.base} />
          <RuleRow title="Starred and family" sub="Android priority senders" value={rules.starred} onChange={(v) => changeRule('starred', v)} color={a.base} />
          <RuleRow title="Repeat callers" sub="Same person calling twice within 15 minutes" value={rules.repeat} onChange={(v) => changeRule('repeat', v)} color={a.base} last />
        </Card>
      </Reveal>

      <SectionHeader title="Context signals" />
      <Reveal index={2}>
        <Card>
          {signals.map((s, i) => {
            const Icon = s.icon;
            const status = perms[s.perm];
            return (
              <View
                key={s.label}
                accessible
                accessibilityLabel={`${s.label}: ${s.value ?? 'no reading'}. ${PERM_LABEL[status]}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] + 2, borderBottomWidth: i === signals.length - 1 ? 0 : 1, borderBottomColor: c.border }}
              >
                <Icon size={20} color={c.textSecondary} strokeWidth={1.9} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{s.label}</Text>
                  <Text variant="caption" color={status === 'granted' ? c.success : c.textTertiary}>
                    {PERM_LABEL[status]}
                  </Text>
                </View>
                <Text variant="calloutMedium" tone={s.value ? 'primary' : 'tertiary'} style={{ textTransform: 'capitalize' }}>
                  {s.value ?? 'No reading'}
                </Text>
              </View>
            );
          })}
        </Card>
      </Reveal>

      <SectionHeader title="What Attune did" action={undoable ? 'Undo last change' : undefined} onAction={undo} />
      <Reveal index={3}>
        <Card>
          {sorted.length === 0 ? (
            <EmptyState icon={<BellOff size={22} color={a.text} strokeWidth={1.9} />} title="No changes yet" body="Every automatic change is logged here with its reason, and can be undone in one tap." />
          ) : (
            <View>
              <View style={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 1, backgroundColor: c.border }} />
              {sorted.slice(0, 12).map((e, i) => {
                const meta = EVENT[e.action];
                const Icon = meta.icon;
                return (
                  <View key={e.id} accessible style={{ flexDirection: 'row', gap: space[4], paddingBottom: i === Math.min(sorted.length, 12) - 1 ? 0 : space[5] }}>
                    <View style={{ width: 31, height: 31, borderRadius: 16, backgroundColor: e.action === 'dnd_on' ? a.soft : c.surfaceRaised, borderWidth: 4, borderColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={13} color={e.action === 'dnd_on' ? a.text : c.textSecondary} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="calloutMedium">{meta.label}</Text>
                        <Text variant="numeral" tone="tertiary">
                          {clock(e.at)}
                        </Text>
                      </View>
                      <Text variant="callout" tone="secondary">
                        {e.reason}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {undoable && (
            <PressableScale onPress={undo} haptics={false} accessibilityLabel="Undo last change" style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[5], alignSelf: 'flex-start', height: 38, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: c.surfaceRaised }}>
              <Undo2 size={16} color={c.text} strokeWidth={1.9} />
              <Text variant="calloutMedium">Undo last change</Text>
            </PressableScale>
          )}
        </Card>
      </Reveal>

      <SectionHeader title="Places you have labelled" />
      <Card>
        <EmptyState
          icon={<Clock3 size={22} color={a.text} strokeWidth={1.9} />}
          title="No places labelled"
          body="Label home, college or the library by Wi-Fi network or location, and Focus will know where quiet is expected."
        />
      </Card>

      <PrivacyCard
        senses="Activity, calendar titles, Wi-Fi or place, and the category of the app in use."
        stays="Context is evaluated on this phone and kept in encrypted local storage."
        never="Your location, calendar and app usage are never uploaded."
      />
    </Screen>
  );
}

function RuleRow({ title, sub, value, onChange, color, last }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void; color: string; last?: boolean }): ReactNode {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] + 2, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="callout" tone="secondary">
          {sub}
        </Text>
      </View>
      <Switch value={value} onChange={onChange} color={color} accessibilityLabel={title} />
    </View>
  );
}

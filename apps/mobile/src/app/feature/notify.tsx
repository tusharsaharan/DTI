import { useMemo, useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { Check, ChevronDown, Inbox, Info, X } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Card, Chip, EmptyState, PressableScale, PrivacyCard, Reveal, Screen, SectionHeader, Text } from '@/ui';
import { FeatureHero, featureEyebrow } from '@/components/FeatureHero';
import { setState, useAttune } from '@/state/store';
import { getAttuneNative } from '../../../modules/attune-native';
import { ago } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { RankedNotification, SenderTier } from '@/state/types';

const TIER_LABEL: Record<SenderTier, string> = { family: 'Family', close: 'Close', class: 'Class', work: 'Work', unknown: 'Unknown' };

const WEIGHTS = [
  { key: 'Sender', w: 0.4, note: 'Who it is: family, close, class, work. Learned from how fast you reply.' },
  { key: 'Message urgency', w: 0.35, note: 'What it says: deadlines, times, mentions, "call me". English and Hinglish.' },
  { key: 'Your responses', w: 0.25, note: 'What you did before: open, reply, dismiss, and your taps here.' },
] as const;

function grant() {
  const fallback = () => Linking.openSettings().catch(() => {});
  try {
    Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS').catch(fallback);
  } catch {
    fallback();
  }
}

export default function NotifyScreen() {
  const { c, feature } = useTheme();
  const a = feature('notify');
  const items = useAttune((s) => s.notifications);
  const access = useAttune((s) => s.permissions.notificationAccess);
  const [noted, setNoted] = useState<Record<string, 'up' | 'down'>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const priority = useMemo(() => items.filter((n) => n.verdict === 'priority').sort((x, y) => y.postedAt - x.postedAt), [items]);
  const originals = useMemo(() => items.filter((n) => n.verdict === 'original').sort((x, y) => y.postedAt - x.postedAt), [items]);
  const groups = useMemo(() => {
    const m = new Map<string, RankedNotification[]>();
    items.filter((n) => n.verdict === 'digest').forEach((n) => m.set(n.app, [...(m.get(n.app) ?? []), n]));
    return [...m.entries()].sort((x, y) => y[1].length - x[1].length);
  }, [items]);
  const senders = useMemo(() => {
    const m = new Map<string, SenderTier>();
    items.forEach((n) => m.set(n.sender, n.tier));
    return [...m.entries()];
  }, [items]);

  const feedback = (n: RankedNotification, up: boolean) => {
    if (up) haptic.success();
    else haptic.warn();
    setNoted((p) => ({ ...p, [n.id]: up ? 'up' : 'down' }));
    setState((s) => ({
      notifications: s.notifications.map((x) =>
        x.id === n.id
          ? { ...x, verdict: up ? 'priority' : 'digest', score: Math.max(0, Math.min(1, x.score + (up ? 0.15 : -0.25))) }
          : x,
      ),
    }));
    const native = getAttuneNative();
    if (native) void native.submitNotificationFeedback(n.id, up ? 'MARKED_IMPORTANT' : 'MARKED_NOT_IMPORTANT');
  };

  return (
    <Screen back title="Priority Inbox" eyebrow={featureEyebrow('notify')} eyebrowColor={a.text} hero={<FeatureHero feature="notify" onGrant={grant} />}>
      <SectionHeader title="Priority now" />
      {priority.length === 0 ? (
        <Reveal>
          <Card>
            <EmptyState
              icon={<Inbox size={22} color={a.text} strokeWidth={1.9} />}
              title={access === 'granted' ? 'Nothing needs you right now' : 'Waiting for notification access'}
              body={
                access === 'granted'
                  ? 'Messages that matter will appear here the moment they arrive.'
                  : 'Attune reads notification text on this phone to rank it. Without access this feature cannot work, and we will not fake it.'
              }
            />
          </Card>
        </Reveal>
      ) : (
        priority.map((n, i) => (
          <Reveal key={n.id} index={i}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
                  {n.sender}
                </Text>
                <Text variant="numeral" tone="tertiary">
                  {ago(n.postedAt)}
                </Text>
              </View>
              <Text variant="caption" tone="tertiary" style={{ marginTop: 2 }}>
                {n.app}
                {n.conversation ? ` · ${n.conversation}` : ''}
              </Text>
              <Text variant="body" tone="secondary" numberOfLines={3} style={{ marginTop: space[3] }}>
                {n.text}
              </Text>
              {n.reasons.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] }}>
                  {n.reasons.map((r) => (
                    <Chip key={r} label={r} color={a.text} soft={a.soft} />
                  ))}
                </View>
              )}
              <View
                accessible
                accessibilityLabel={`Priority score ${Math.round(n.score * 100)} percent`}
                style={{ height: 3, borderRadius: 2, backgroundColor: c.surfacePressed, marginTop: space[4], overflow: 'hidden' }}
              >
                <View style={{ width: `${Math.round(n.score * 100)}%`, height: 3, backgroundColor: a.base }} />
              </View>
              <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[4], alignItems: 'center' }}>
                {noted[n.id] ? (
                  <Text variant="callout" tone="secondary">
                    Noted. Attune will rank {n.sender} {noted[n.id] === 'up' ? 'higher' : 'lower'}.
                  </Text>
                ) : (
                  <>
                    <FeedbackButton label="Important" icon={<Check size={16} color={a.text} strokeWidth={2} />} onPress={() => feedback(n, true)} fg={a.text} bg={a.soft} />
                    <FeedbackButton label="Not important" icon={<X size={16} color={c.textSecondary} strokeWidth={2} />} onPress={() => feedback(n, false)} fg={c.textSecondary} bg={c.surfaceRaised} />
                  </>
                )}
              </View>
            </Card>
          </Reveal>
        ))
      )}

      {originals.length > 0 && (
        <>
          <SectionHeader title="Left in place" />
          <Card>
            {originals.slice(0, 8).map((n) => (
              <View key={n.id} style={{ gap: 2, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text variant="calloutMedium">{n.sender}</Text>
                <Text variant="caption" tone="tertiary">{n.app}{n.conversation ? ` · ${n.conversation}` : ''}</Text>
                <Text variant="callout" tone="secondary" numberOfLines={2}>{n.text}</Text>
              </View>
            ))}
            <Text variant="caption" tone="tertiary" style={{ marginTop: space[3] }}>
              Mid-score notifications stay in the source app instead of being cancelled or reposted.
            </Text>
          </Card>
        </>
      )}

      <SectionHeader title="Held for later" />
      {groups.length === 0 ? (
        <Card>
          <EmptyState title="No digest yet" body="Low-score notifications are quietly held here and delivered on your schedule or at unlock." />
        </Card>
      ) : (
        <Card>
          {groups.map(([app, list], i) => {
            const isOpen = !!open[app];
            return (
              <View key={app} style={{ borderBottomWidth: i === groups.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                <PressableScale
                  accessibilityLabel={`${app}, ${list.length} held. ${isOpen ? 'Collapse' : 'Expand'}`}
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => setOpen((p) => ({ ...p, [app]: !p[app] }))}
                  scaleTo={0.985}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space[4], gap: space[3] }}
                >
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {app}
                  </Text>
                  <Text variant="numeral" tone="secondary">
                    {list.length}
                  </Text>
                  <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={18} color={c.textTertiary} strokeWidth={1.9} />
                  </View>
                </PressableScale>
                {isOpen && (
                  <View style={{ gap: space[3], paddingBottom: space[4] }}>
                    {list.map((n) => (
                      <View key={n.id} style={{ gap: 2 }}>
                        <Text variant="calloutMedium">
                          {n.sender}
                          <Text variant="caption" tone="tertiary">
                            {'  '}
                            {ago(n.postedAt)}
                          </Text>
                        </Text>
                        <Text variant="callout" tone="secondary" numberOfLines={2}>
                          {n.text}
                        </Text>
                        <Text variant="caption" color={a.text} onPress={() => feedback(n, true)} accessibilityRole="button" style={{ marginTop: 2 }}>
                          This one is important
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      <SectionHeader title="How ranking works" />
      <Reveal>
        <Card>
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
            {WEIGHTS.map((w, i) => (
              <View key={w.key} style={{ flex: w.w, backgroundColor: a.base, opacity: 1 - i * 0.3 }} />
            ))}
          </View>
          <View style={{ gap: space[4], marginTop: space[5] }}>
            {WEIGHTS.map((w, i) => (
              <View key={w.key} style={{ flexDirection: 'row', gap: space[3] }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: a.base, opacity: 1 - i * 0.3 }} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">
                    {w.key}{' '}
                    <Text variant="numeral" tone="tertiary">
                      {Math.round(w.w * 100)}%
                    </Text>
                  </Text>
                  <Text variant="callout" tone="secondary">
                    {w.note}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </Reveal>

      <SectionHeader title="Senders" />
      <Card>
        {senders.length === 0 ? (
          <EmptyState title="No senders learned yet" body="Each person gets a tier (family, close, class, work) as Attune sees how you respond to them." />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {senders.map(([name, tier]) => (
              <Chip key={name} label={`${name} · ${TIER_LABEL[tier]}`} size="md" />
            ))}
          </View>
        )}
      </Card>

      <View accessible style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: a.soft }}>
        <Info size={18} color={a.text} strokeWidth={1.9} style={{ marginTop: 2 }} />
        <Text variant="callout" style={{ flex: 1 }}>
          Mute noisy groups in WhatsApp. Attune becomes their smart sound.
        </Text>
      </View>

      <PrivacyCard
        senses="Sender, group and message text from notifications, read on this phone."
        stays="Scores and your feedback live in encrypted on-device storage."
        never="Message text is never uploaded or shared."
      />
    </Screen>
  );
}

function FeedbackButton({ label, icon, onPress, fg, bg }: { label: string; icon: ReactNode; onPress: () => void; fg: string; bg: string }) {
  return (
    <PressableScale
      onPress={onPress}
      haptics={false}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] + 2, height: 38, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: bg }}
    >
      {icon}
      <Text variant="calloutMedium" color={fg}>
        {label}
      </Text>
    </PressableScale>
  );
}

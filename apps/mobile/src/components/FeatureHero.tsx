/**
 * FeatureHero — shared top block for all 5 feature pages. Pass it as <Screen hero={...}>.
 * (Screen supplies the eyebrow + title; this adds tagline, persona, master switch, status, permission banner.)
 *
 * Props:
 *  - feature: FeatureKey            which feature (reads tokens + store `features[feature]`)
 *  - onGrant?: () => void           called by the "Grant" CTA of the missing-permissions banner
 *  - personaNote?: string           tail of the persona line, default "and everyone who lives in a group chat that never sleeps"
 *  - children?: ReactNode           optional extra hero content (big stat, ring) rendered under the status row
 *
 * Helper: `featureEyebrow(key)` returns "Idea 01" for Screen's `eyebrow`.
 * The switch writes store.features[feature].enabled. The mode chip reflects store.features[feature].mode.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { features, layout, palette, radius, space, useTheme, type FeatureKey } from '@/theme';
import { Chip, PressableScale, Reveal, Switch, Text } from '@/ui';
import { useAttune } from '@/state/store';
import { toggleFeature } from '@/state/nativeActions';
import type { FeatureMode, PermissionKey } from '@/state/types';

export const featureEyebrow = (key: FeatureKey) => `Idea ${String(features[key].index).padStart(2, '0')}`;

const MODE_LABEL: Record<FeatureMode, string> = {
  full: 'Full power',
  reduced: 'Reduced mode',
  minimal: 'Minimal mode',
  off: 'Off',
};

const PERMISSION_LABEL: Record<PermissionKey, string> = {
  notificationAccess: 'Notification access',
  postNotifications: 'Post notifications',
  dndPolicy: 'Do Not Disturb access',
  usageAccess: 'Usage access',
  activityRecognition: 'Activity recognition',
  calendar: 'Calendar',
  location: 'Location',
  camera: 'Camera',
  microphone: 'Microphone',
  batteryExemption: 'Battery exemption',
  keyboardEnabled: 'Attune as your keyboard',
};

export interface FeatureHeroProps {
  feature: FeatureKey;
  onGrant?: () => void;
  personaNote?: string;
  children?: ReactNode;
}

export function FeatureHero({
  feature,
  onGrant,
  personaNote = 'and everyone who lives in a group chat that never sleeps',
  children,
}: FeatureHeroProps) {
  const { c, feature: f } = useTheme();
  const accent = f(feature);
  const meta = features[feature];
  const status = useAttune((s) => s.features[feature]);

  const toggle = (enabled: boolean) => {
    void toggleFeature(feature, enabled);
  };

  return (
    <View style={{ paddingHorizontal: layout.gutter, gap: space[5], marginBottom: space[6] }}>
      <Reveal index={0} style={{ gap: space[3] }}>
        <Text variant="title2" tone="secondary" style={{ maxWidth: 340 }}>
          {meta.tagline}
        </Text>
        <Text variant="callout" tone="tertiary">
          Built for {meta.persona} — {personaNote}
        </Text>
      </Reveal>

      <Reveal index={1}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[4],
            paddingVertical: space[4],
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: c.border,
          }}
        >
          <View style={{ flex: 1, gap: space[2] }}>
            <Text variant="bodyMedium">{status.enabled ? 'On' : 'Off'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
              <Chip label={MODE_LABEL[status.mode]} color={status.enabled ? accent.text : undefined} soft={status.enabled ? accent.soft : undefined} dot />
            </View>
            <Text variant="callout" tone="secondary">
              {status.headline}
            </Text>
          </View>
          <Switch value={status.enabled} onChange={toggle} color={accent.base} accessibilityLabel={`Enable ${meta.name}`} />
        </View>
      </Reveal>

      {status.missing.length > 0 && (
        <Reveal index={2}>
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              padding: space[4],
              borderRadius: radius.md,
              backgroundColor: accent.soft,
            }}
          >
            <Lock size={18} color={accent.text} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="calloutMedium">Needs {status.missing.length === 1 ? 'one permission' : `${status.missing.length} permissions`}</Text>
              <Text variant="caption" tone="secondary">
                {status.missing.map((m) => PERMISSION_LABEL[m]).join(' · ')}
              </Text>
            </View>
            {onGrant && (
              <PressableScale
                onPress={onGrant}
                accessibilityLabel="Grant permissions"
                style={{ paddingHorizontal: space[4], height: 36, borderRadius: radius.pill, backgroundColor: accent.base, justifyContent: 'center' }}
              >
                <Text variant="calloutMedium" color={palette.ink[50]}>
                  Grant
                </Text>
              </PressableScale>
            )}
          </View>
        </Reveal>
      )}

      {children}
    </View>
  );
}

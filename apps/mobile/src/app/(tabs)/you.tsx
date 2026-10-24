import { useState } from 'react';
import { Alert, View } from 'react-native';
import { ChevronRight, ShieldCheck, Trash2 } from 'lucide-react-native';
import { featureOrder, features, space, useTheme } from '@/theme';
import { Card, Chip, FeatureIcon, Reveal, Row, Screen, SectionHeader, Switch, Text } from '@/ui';
import { TAB_BAR_SPACE } from '@/components/TabBar';
import { useAttune } from '@/state/store';
import { toggleFeature } from '@/state/nativeActions';
import { openPermissionSettings, permissionList } from '@/state/permissionInfo';
import { clearDesignPreview, loadDesignPreview } from '@/state/preview';
import { wipeAll } from '@/state/persist';
import { haptic } from '@/lib/haptics';
import type { PermissionStatus } from '@/state/types';

const STATUS: Record<PermissionStatus, string> = { granted: 'Granted', denied: 'Denied', unknown: 'Not checked' };

const TEAM = ['Aman', 'Prince', 'Riya', 'Shreya', 'Rahul', 'Yash', 'Tushar', 'Rakesh', 'Omprakash', 'Varshith'];

export default function You() {
  const { c } = useTheme();
  const permissions = useAttune((s) => s.permissions);
  const enabled = useAttune((s) => s.features);
  const [preview, setPreview] = useState(false);

  const confirmWipe = () => {
    haptic.warn();
    Alert.alert('Delete all data?', 'This clears everything Attune stored on this phone and resets your settings. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void wipeAll() },
    ]);
  };

  const dot = (s: PermissionStatus) => (s === 'granted' ? c.success : s === 'denied' ? c.danger : c.textTertiary);

  return (
    <Screen title="You" eyebrow="Attune" bottomInset={TAB_BAR_SPACE}>
      <Reveal index={0}>
        <Text variant="body" tone="secondary">
          No account, no profile. Attune works for you on this phone and nowhere else.
        </Text>
      </Reveal>

      <SectionHeader title="Features" />
      <Reveal index={1}>
        <Card>
          {featureOrder.map((k, n) => (
            <Row
              key={k}
              last={n === featureOrder.length - 1}
              icon={<FeatureIcon feature={k} size={36} />}
              title={features[k].name}
              subtitle={enabled[k].enabled ? enabled[k].headline : 'Off'}
              trailing={
                <Switch
                  value={enabled[k].enabled}
                   onChange={(v) => void toggleFeature(k, v)}
                  color={getFeatureColor(k, c)}
                  accessibilityLabel={`${features[k].name} on or off`}
                />
              }
            />
          ))}
        </Card>
      </Reveal>

      <SectionHeader title="Permissions" />
      <Reveal index={2}>
        <Card>
          {permissionList.map((p, n) => {
            const st = permissions[p.key];
            return (
              <Row
                key={p.key}
                last={n === permissionList.length - 1}
                title={p.title}
                subtitle={p.optional ? 'Optional' : undefined}
                onPress={() => openPermissionSettings(p)}
                trailing={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot(st) }} />
                    <Text variant="caption" tone="secondary">
                      {STATUS[st]}
                    </Text>
                    <ChevronRight size={16} color={c.textTertiary} strokeWidth={2} />
                  </View>
                }
              />
            );
          })}
        </Card>
        <Text variant="caption" tone="tertiary" style={{ marginTop: space[2] }}>
          Tap a row to open the matching Android settings screen.
        </Text>
      </Reveal>

      <SectionHeader title="Privacy" />
      <Reveal index={3}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
            <ShieldCheck size={20} color={c.success} strokeWidth={2} />
            <Text variant="title3">Everything stays on this phone</Text>
          </View>
          <Text variant="callout" tone="secondary">
            Messages, typing, audio and camera frames are processed on the device and never uploaded. Only anonymous model updates may be shared, and only if you join.
          </Text>
          <Row
            last
            onPress={confirmWipe}
            icon={<Trash2 size={18} color={c.danger} strokeWidth={1.9} />}
            title="Delete all data"
            subtitle="Clear everything Attune stored here"
          />
        </Card>
      </Reveal>

      <SectionHeader title="About" />
      <Reveal index={4}>
        <Card>
          <Text variant="title3">Attune</Text>
          <Text variant="callout" tone="secondary" style={{ marginTop: space[1] }}>
            DTI Project, Design Thinking. Same phone, just a bit smarter.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] }}>
            {TEAM.map((n) => (
              <Chip key={n} label={n} />
            ))}
          </View>
        </Card>
      </Reveal>

      {__DEV__ && (
        <Reveal index={5}>
          <Card>
            <Row
              last
              title="Design preview"
              subtitle="Fill screens with sample data. Dev builds only."
              trailing={
                <Switch
                  value={preview}
                  onChange={(v) => {
                    setPreview(v);
                    if (v) loadDesignPreview();
                    else clearDesignPreview();
                  }}
                  accessibilityLabel="Design preview data"
                />
              }
            />
          </Card>
        </Reveal>
      )}
    </Screen>
  );
}

function getFeatureColor(k: (typeof featureOrder)[number], c: ReturnType<typeof useTheme>['c']) {
  return c.feature[k].base;
}

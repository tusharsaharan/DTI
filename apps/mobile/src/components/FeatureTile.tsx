import { View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { features, radius, space, useTheme, type FeatureKey } from '@/theme';
import { useAttune } from '@/state/store';
import type { FeatureMode } from '@/state/types';
import { Text } from '@/ui/Text';
import { FeatureIcon } from '@/ui/FeatureIcon';
import { PressableScale } from '@/ui/PressableScale';

const modeLabel: Record<FeatureMode, string> = {
  full: 'Full',
  reduced: 'Sensors only',
  minimal: 'Minimal',
  off: 'Off',
};

export interface FeatureTileProps {
  feature: FeatureKey;
  variant?: 'wide' | 'compact';
  /** Extra line under the headline (wide only), e.g. top priority message. */
  detail?: string | null;
}

export function FeatureTile({ feature: key, variant = 'compact', detail }: FeatureTileProps) {
  const { c, feature } = useTheme();
  const status = useAttune((s) => s.features[key]);
  const accent = feature(key);
  const meta = features[key];
  const index = String(meta.index).padStart(2, '0');
  const wide = variant === 'wide';
  const live = status.enabled && status.mode !== 'off';

  return (
    <PressableScale
      accessibilityLabel={`${meta.name}. ${status.headline}. ${modeLabel[status.mode]}. Opens ${meta.name}.`}
      onPress={() => router.push(`/feature/${key}` as never)}
      style={{
        flex: wide ? undefined : 1,
        minHeight: wide ? 168 : 176,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        padding: space[5],
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      {/* accent hairline */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: space[5],
          right: space[5],
          height: 2,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          backgroundColor: live ? accent.base : c.border,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <FeatureIcon feature={key} size={40} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="numeral" tone="tertiary">
            {index}
          </Text>
          {wide && <ArrowUpRight size={18} color={c.textTertiary} strokeWidth={1.9} />}
        </View>
      </View>

      <View style={{ gap: space[1], marginTop: space[5] }}>
        <Text variant="overline" uppercase color={live ? accent.text : c.textTertiary}>
          {meta.short}
        </Text>
        <Text variant={wide ? 'title1' : 'title3'} numberOfLines={wide ? 2 : 3} tone={live ? 'primary' : 'secondary'}>
          {status.headline}
        </Text>
        {wide && detail ? (
          <Text variant="callout" tone="secondary" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: live ? accent.base : c.textTertiary,
              opacity: status.mode === 'reduced' ? 0.55 : 1,
            }}
          />
          <Text variant="caption" tone="tertiary">
            {modeLabel[status.mode]}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

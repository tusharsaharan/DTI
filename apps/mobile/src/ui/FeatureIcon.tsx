import { View } from 'react-native';
import { BellRing, Eye, Keyboard, Moon, Volume2, type LucideIcon } from 'lucide-react-native';
import { radius, useTheme, type FeatureKey } from '@/theme';

export const featureIcons: Record<FeatureKey, LucideIcon> = {
  notify: BellRing,
  keyboard: Keyboard,
  focus: Moon,
  attention: Eye,
  volume: Volume2,
};

/** Feature glyph on its soft accent tile. */
export function FeatureIcon({ feature, size = 40 }: { feature: FeatureKey; size?: number }) {
  const { feature: f } = useTheme();
  const accent = f(feature);
  const Icon = featureIcons[feature];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size >= 48 ? radius.md : radius.sm,
        backgroundColor: accent.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size * 0.5} color={accent.base} strokeWidth={1.9} />
    </View>
  );
}

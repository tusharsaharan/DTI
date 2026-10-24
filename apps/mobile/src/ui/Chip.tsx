import { View } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  /** Accent colour; the chip uses its soft wash as background. */
  color?: string;
  soft?: string;
  dot?: boolean;
  size?: 'sm' | 'md';
}

export function Chip({ label, color, soft, dot, size = 'sm' }: ChipProps) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space[1] + 2,
        paddingHorizontal: size === 'sm' ? space[2] + 2 : space[3],
        paddingVertical: size === 'sm' ? 4 : 6,
        borderRadius: radius.pill,
        backgroundColor: soft ?? c.surfaceRaised,
        borderWidth: soft ? 0 : 1,
        borderColor: c.border,
      }}
    >
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color ?? c.text }} />}
      <Text variant="caption" color={color ?? c.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

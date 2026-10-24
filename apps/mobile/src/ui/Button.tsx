import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Accent for primary buttons on feature pages. */
  color?: string;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
}

export function Button({ label, onPress, variant = 'primary', color, icon, loading, disabled, full }: ButtonProps) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? (color ?? c.accent) : variant === 'secondary' ? c.surfaceRaised : 'transparent';
  const fg = variant === 'primary' ? (color ? '#0A0A0B' : c.onAccent) : c.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptics="press"
      accessibilityLabel={label}
      style={{
        height: 54,
        paddingHorizontal: space[6],
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: full ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {icon}
          <Text variant="bodyMedium" color={fg}>
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

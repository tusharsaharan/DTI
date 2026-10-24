import { View, type ViewProps } from 'react-native';
import { layout, radius, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';

export interface CardProps extends ViewProps {
  /** Tints the card with a feature accent wash. */
  tint?: string;
  padded?: boolean;
  raised?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Card({ tint, padded = true, raised, onPress, style, children, ...rest }: CardProps) {
  const { c } = useTheme();
  const base = [
    {
      backgroundColor: tint ?? (raised ? c.surfaceRaised : c.surface),
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: padded ? layout.cardPadding : 0,
      overflow: 'hidden' as const,
    },
    style,
  ];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={base} {...rest}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={base} {...rest}>
      {children}
    </View>
  );
}

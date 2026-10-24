import { Text as RNText, type TextProps } from 'react-native';
import { type, type TypeVariant, useTheme } from '@/theme';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'danger';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  /** Overrides tone with an explicit colour (e.g. a feature accent). */
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** Tabular numerals for live counters. */
  tabular?: boolean;
  uppercase?: boolean;
}

export function Text({ variant = 'body', tone = 'primary', color, align, tabular, uppercase, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  const toneColor = {
    primary: c.text,
    secondary: c.textSecondary,
    tertiary: c.textTertiary,
    inverse: c.textInverse,
    danger: c.danger,
  }[tone];
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[
        type[variant],
        { color: color ?? toneColor, textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        uppercase && { textTransform: 'uppercase' },
        style,
      ]}
      {...rest}
    />
  );
}

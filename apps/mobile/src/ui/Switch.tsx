import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion, useTheme } from '@/theme';
import { haptic } from '@/lib/haptics';

export interface SwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const W = 52;
const H = 32;
const KNOB = 26;

export function Switch({ value, onChange, color, disabled, accessibilityLabel }: SwitchProps) {
  const { c } = useTheme();
  const on = color ?? c.accent;
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(value ? 1 : 0, motion.spring.snappy);
  }, [value, p]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [c.surfacePressed, on]),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * (W - KNOB - 6) }, { scale: 1 - Math.sin(p.value * Math.PI) * 0.08 }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        haptic.toggle();
        onChange(!value);
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View style={[{ width: W, height: H, borderRadius: H / 2, padding: 3, justifyContent: 'center' }, track]}>
        <Animated.View
          style={[
            { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FFFFFF', elevation: 2 },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

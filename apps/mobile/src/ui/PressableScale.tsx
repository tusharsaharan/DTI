import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '@/theme';
import { haptic } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptics?: 'tap' | 'press' | 'toggle' | false;
}

/** Every tappable surface: springs down on press, light haptic on release. */
export function PressableScale({ style, scaleTo = motion.pressScale, haptics = 'tap', onPressIn, onPressOut, onPress, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={(e) => {
        // Reanimated SharedValue mutation is intentional inside the press callback.
        // eslint-disable-next-line react-hooks/immutability
        scale.value = withSpring(scaleTo, motion.spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // eslint-disable-next-line react-hooks/immutability
        scale.value = withSpring(1, motion.spring.bouncy);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic[haptics]();
        onPress?.(e);
      }}
      style={[style, aStyle]}
      {...rest}
    />
  );
}

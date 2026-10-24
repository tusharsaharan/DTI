import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { motion } from '@/theme';

/** Staggered spring entrance for list/page sections. `index` sets the delay. */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(index * motion.stagger)
        .springify()
        .damping(motion.spring.smooth.damping)
        .stiffness(motion.spring.smooth.stiffness)}
    >
      {children}
    </Animated.View>
  );
}

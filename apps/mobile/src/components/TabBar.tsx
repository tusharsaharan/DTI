import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { CalendarDays, Sparkles, UserRound, type LucideIcon } from 'lucide-react-native';
import { motion, radius, space, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

const icons: Record<string, LucideIcon> = { index: Sparkles, week: CalendarDays, you: UserRound };

/** Floating pill tab bar with a spring-sliding active indicator. */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const slot = w / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(state.index * slot, motion.spring.smooth);
  }, [state.index, slot, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + space[3], alignItems: 'center' }}
    >
      <View
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width - 12)}
        style={{
          flexDirection: 'row',
          width: 280,
          height: 64,
          padding: 6,
          borderRadius: radius.pill,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.borderStrong,
          backgroundColor: scheme === 'dark' ? '#17171ACC' : '#FFFFFFD9',
        }}
      >
        <BlurView intensity={40} tint={scheme} style={{ position: 'absolute', inset: 0 }} />
        {slot > 0 && (
          <Animated.View
            style={[
              { position: 'absolute', top: 6, left: 6, width: slot, height: 50, borderRadius: radius.pill, backgroundColor: c.accent },
              indicator,
            ]}
          />
        )}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const Icon = icons[route.name] ?? Sparkles;
          const label = descriptors[route.key].options.title ?? route.name;
          return (
            <PressableScale
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              style={{ flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon size={18} color={focused ? c.onAccent : c.textSecondary} strokeWidth={2} />
              {focused && (
                <Text variant="calloutMedium" color={c.onAccent}>
                  {label}
                </Text>
              )}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** Space screens must leave at the bottom so content clears the floating bar. */
export const TAB_BAR_SPACE = 64 + space[6];

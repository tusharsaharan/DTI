import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { layout, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ScreenProps {
  title: string;
  /** Small line above the large title (e.g. "Idea 01"). */
  eyebrow?: string;
  eyebrowColor?: string;
  back?: boolean;
  /** Right-side header slot (icon button). */
  action?: ReactNode;
  /** Extra space at the bottom (e.g. above the tab bar). */
  bottomInset?: number;
  /** Rendered between the large title and the content, scrolls with it (hero visuals). */
  hero?: ReactNode;
  children: ReactNode;
}

const COLLAPSE = 56;

/**
 * Standard page: large editorial title that collapses into a compact blurred-feel header as you scroll.
 */
export function Screen({ title, eyebrow, eyebrowColor, back, action, bottomInset = 0, hero, children }: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });

  const compactTitle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [COLLAPSE - 16, COLLAPSE + 8], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(y.value, [COLLAPSE - 16, COLLAPSE + 8], [6, 0], Extrapolation.CLAMP) }],
  }));
  const headerBg = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, COLLAPSE], [0, 1], Extrapolation.CLAMP),
  }));
  const largeTitle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, COLLAPSE], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(y.value, [-120, 0], [24, 0], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-160, 0], [1.08, 1], Extrapolation.CLAMP) },
    ],
  }));

  const headerH = insets.top + 52;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerH + space[2],
          paddingBottom: insets.bottom + space[9] + bottomInset,
        }}
      >
        <Animated.View style={[{ paddingHorizontal: layout.gutter, marginBottom: space[6], transformOrigin: 'left' }, largeTitle]}>
          {eyebrow && (
            <Text variant="overline" uppercase color={eyebrowColor} tone="tertiary" style={{ marginBottom: space[2] }}>
              {eyebrow}
            </Text>
          )}
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
        </Animated.View>
        {hero}
        <View style={{ paddingHorizontal: layout.gutter, gap: space[4] }}>{children}</View>
      </Animated.ScrollView>

      {/* Compact header */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH }}>
        <Animated.View
          style={[
            { position: 'absolute', inset: 0, backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border },
            headerBg,
          ]}
        />
        <View
          pointerEvents="box-none"
          style={{
            marginTop: insets.top,
            height: 52,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: layout.gutter - 6,
          }}
        >
          <View style={{ width: 44 }}>
            {back && (
              <PressableScale
                accessibilityLabel="Back"
                onPress={() => router.back()}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}
              >
                <ChevronLeft size={22} color={c.text} strokeWidth={2} />
              </PressableScale>
            )}
          </View>
          <Animated.View style={[{ flex: 1, alignItems: 'center' }, compactTitle]}>
            <Text variant="title3" numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
          <View style={{ width: 44, alignItems: 'flex-end' }}>{action}</View>
        </View>
      </View>
    </View>
  );
}

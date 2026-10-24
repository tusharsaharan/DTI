import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { layout, motion, radius, space, useTheme } from '@/theme';
import { Button, Card, FeatureIcon, PressableScale, Text } from '@/ui';
import { haptic } from '@/lib/haptics';
import { completeOnboarding } from '@/state/persist';
import { openPermissionSettings, permissionList } from '@/state/permissionInfo';

const FEATURE_NAMES = { notify: 'Inbox', keyboard: 'Keyboard', focus: 'Focus', attention: 'Screen time', volume: 'Volume' } as const;

export default function Permissions() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const total = permissionList.length;
  const p = permissionList[Math.min(i, total - 1)];
  const done = i >= total;

  const finish = () => {
    haptic.success();
    completeOnboarding();
    router.replace('/');
  };
  const next = () => setI((n) => n + 1);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[5] }}>
      <View style={{ paddingHorizontal: layout.gutter - 6, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <PressableScale
          accessibilityLabel="Back"
          onPress={() => (i > 0 ? setI(i - 1) : router.back())}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}
        >
          <ChevronLeft size={22} color={c.text} strokeWidth={2} />
        </PressableScale>
        <View
          style={{ flex: 1, flexDirection: 'row', gap: 4 }}
          accessible
          accessibilityLabel={`Step ${Math.min(i + 1, total)} of ${total}`}
        >
          {permissionList.map((q, n) => (
            <Segment key={q.key} filled={n < i || done} current={n === i && !done} />
          ))}
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: layout.gutter, justifyContent: 'center' }}>
        {done ? (
          <Animated.View entering={FadeInRight.springify().damping(motion.spring.smooth.damping)} style={{ gap: space[4] }}>
            <Text variant="overline" tone="tertiary" uppercase>
              All set
            </Text>
            <Text variant="display" accessibilityRole="header">
              You can change any of this later.
            </Text>
            <Text variant="body" tone="secondary">
              Anything skipped stays off, and each feature quietly does what it can without it. You will find every permission under You.
            </Text>
          </Animated.View>
        ) : (
          <Animated.View
            key={p.key}
            entering={FadeInRight.springify().damping(motion.spring.smooth.damping).stiffness(motion.spring.smooth.stiffness)}
            exiting={FadeOutLeft.duration(motion.duration.fast)}
            style={{ gap: space[5] }}
          >
            <Text variant="overline" tone="tertiary" uppercase>
              {i + 1} of {total}
              {p.optional ? ' · optional' : ''}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {p.title}
            </Text>
            <Text variant="body" tone="secondary">
              {p.why}
            </Text>
            <Card raised>
              <Text variant="overline" tone="tertiary" uppercase style={{ marginBottom: space[3] }}>
                Powers
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                {p.powers.map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <FeatureIcon feature={k} size={32} />
                    <Text variant="calloutMedium">{FEATURE_NAMES[k]}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </Animated.View>
        )}
      </View>

      <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
        {done ? (
          <Button label="Finish" onPress={finish} full />
        ) : (
          <>
            <Button
              label="Allow"
              full
              onPress={async () => {
                await openPermissionSettings(p);
                next();
              }}
            />
            <Button label="Not now" variant="ghost" full onPress={next} />
          </>
        )}
      </View>
    </View>
  );
}

function Segment({ filled, current }: { filled: boolean; current: boolean }) {
  const { c } = useTheme();
  const style = useAnimatedStyle(() => ({
    flex: withSpring(current ? 2.4 : 1, motion.spring.snappy),
  }));
  return (
    <Animated.View
      style={[{ height: 4, borderRadius: radius.pill, backgroundColor: filled || current ? c.text : c.surfacePressed, opacity: current ? 1 : filled ? 0.7 : 1 }, style]}
    />
  );
}

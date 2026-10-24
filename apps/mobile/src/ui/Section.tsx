import type { ReactNode } from 'react';
import { View } from 'react-native';
import { space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** Section label row: overline title + optional trailing action. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space[4] }}>
      <Text variant="overline" tone="tertiary" uppercase>
        {title}
      </Text>
      {action && onAction && (
        <PressableScale onPress={onAction} hitSlop={10}>
          <Text variant="calloutMedium" tone="secondary">
            {action}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

/** Settings-style row inside a Card. */
export function Row({
  icon,
  title,
  subtitle,
  trailing,
  onPress,
  last,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const { c } = useTheme();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3] + 2,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
      }}
    >
      {icon && (
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium">{title}</Text>
        {subtitle && (
          <Text variant="callout" tone="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
    </View>
  );
  return onPress ? <PressableScale onPress={onPress} scaleTo={0.985}>{body}</PressableScale> : body;
}

/** Designed empty state: explains what will appear and what's needed. Never fake data. */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'flex-start', gap: space[3], paddingVertical: space[2] }}>
      {icon}
      <Text variant="title3">{title}</Text>
      <Text variant="callout" tone="secondary">
        {body}
      </Text>
      {action}
    </View>
  );
}

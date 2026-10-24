import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function FeatureLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: 'ios_from_right',
      }}
    />
  );
}

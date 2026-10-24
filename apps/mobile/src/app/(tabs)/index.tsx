import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { featureOrder, space, type FeatureKey } from '@/theme';
import { useAttune } from '@/state/store';
import { greeting } from '@/lib/format';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { SectionHeader } from '@/ui/Section';
import { ContextCard } from '@/components/ContextCard';
import { FeatureTile } from '@/components/FeatureTile';
import { TAB_BAR_SPACE } from '@/components/TabBar';

const dateLine = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export default function Today() {
  const hydrated = useAttune((s) => s.hydrated);
  const onboarded = useAttune((s) => s.onboarded);
  const top = useAttune((s) => s.notifications.find((n) => n.verdict === 'priority') ?? null);

  if (hydrated && !onboarded) return <Redirect href="/onboarding" />;

  const [notify, ...rest] = featureOrder;
  const pairs: FeatureKey[][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push(rest.slice(i, i + 2));

  return (
    <Screen title={greeting()} eyebrow={dateLine()} bottomInset={TAB_BAR_SPACE}>
      <Reveal index={0}>
        <ContextCard />
      </Reveal>

      <Reveal index={1}>
        <SectionHeader title="Your phone, adapting" />
      </Reveal>

      <Reveal index={2}>
        <FeatureTile feature={notify} variant="wide" detail={top ? `${top.sender} · ${top.text}` : null} />
      </Reveal>

      {pairs.map((pair, i) => (
        <Reveal key={pair.join()} index={3 + i}>
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            {pair.map((k) => (
              <FeatureTile key={k} feature={k} variant="compact" />
            ))}
          </View>
        </Reveal>
      ))}
    </Screen>
  );
}

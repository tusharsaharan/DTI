import { useMemo, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { Keyboard as KeyboardIcon, Sparkles } from 'lucide-react-native';
import { palette, radius, space, useTheme } from '@/theme';
import { Button, Card, Chip, EmptyState, PrivacyCard, Reveal, Screen, SectionHeader, Switch, Text } from '@/ui';
import { FeatureHero, featureEyebrow } from '@/components/FeatureHero';
import { setState, useAttune } from '@/state/store';
import { ago, percent } from '@/lib/format';
import { tokenize } from '@/features/keyboard/hinglish';

function openKeyboardSettings() {
  const fallback = () => Linking.openSettings().catch(() => {});
  try {
    Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS').catch(fallback);
  } catch {
    fallback();
  }
}

export default function KeyboardScreen() {
  const { c, feature } = useTheme();
  const a = feature('keyboard');
  const kb = useAttune((s) => s.keyboard);
  const [text, setText] = useState('');
  const tokens = useMemo(() => tokenize(text), [text]);
  const hi = tokens.filter((t) => t.lang === 'hi').length;

  const mix = kb ? [
    { label: 'English', v: kb.languageMix.english, o: 1 },
    { label: 'Hinglish', v: kb.languageMix.hinglish, o: 0.6 },
    { label: 'Other', v: kb.languageMix.other, o: 0.25 },
  ] : [];

  const setJoined = (joined: boolean) =>
    setState((s) => (s.keyboard ? { keyboard: { ...s.keyboard, federated: { ...s.keyboard.federated, joined } } } : {}));

  return (
    <Screen back title="Attune Keyboard" eyebrow={featureEyebrow('keyboard')} eyebrowColor={a.text} hero={<FeatureHero feature="keyboard" onGrant={openKeyboardSettings} personaNote="and everyone who types Hinglish without being corrected" />}>
      <SectionHeader title="This week" />
      <Reveal>
        <Card>
          {kb ? (
            <>
              <Text variant="hero" accessibilityLabel={`${kb.keystrokesSaved} keystrokes saved`}>
                {kb.keystrokesSaved.toLocaleString()}
              </Text>
              <Text variant="callout" tone="secondary" style={{ marginTop: space[1] }}>
                keystrokes saved
              </Text>
              <View style={{ flexDirection: 'row', gap: space[7], marginTop: space[5] }}>
                <Stat label="Corrections avoided" value={kb.correctionsAvoided.toLocaleString()} />
                <Stat label="Words learned" value={kb.wordsLearned.toLocaleString()} />
              </View>
            </>
          ) : (
            <EmptyState
              icon={<KeyboardIcon size={22} color={a.text} strokeWidth={1.9} />}
              title="No typing stats yet"
              body="Use the Attune keyboard for a day. Corrections it avoids and keystrokes it saves will be counted here, on this phone."
            />
          )}
        </Card>
      </Reveal>

      <SectionHeader title="Language mix" />
      <Reveal index={1}>
        <Card>
          {kb && mix.some((m) => m.v > 0) ? (
            <>
              <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                {mix.filter((m) => m.v > 0).map((m) => (
                  <View key={m.label} style={{ flex: m.v, backgroundColor: a.base, opacity: m.o }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4] }}>
                {mix.map((m) => (
                  <View key={m.label} style={{ gap: 2 }}>
                    <Text variant="numeral">{percent(m.v / (mix.reduce((s, x) => s + x.v, 0) || 1))}</Text>
                    <Text variant="caption" tone="secondary">
                      {m.label}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <EmptyState title="Nothing measured yet" body="Your English, Hinglish and other-language split appears once you have typed a few messages." />
          )}
        </Card>
      </Reveal>

      <SectionHeader title="Try it" />
      <Reveal index={2}>
        <Card>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="kal ka plan kya hai, let's meet at 5"
            placeholderTextColor={c.textTertiary}
            selectionColor={a.base}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Typing pad"
            style={{
              minHeight: 96,
              padding: space[4],
              borderRadius: radius.md,
              backgroundColor: c.surfaceRaised,
              color: c.text,
              fontSize: 18,
              lineHeight: 26,
              textAlignVertical: 'top',
            }}
          />
          {tokens.length > 0 ? (
            <View style={{ marginTop: space[4], gap: space[3] }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {tokens.map((t, i) => (
                  <Chip key={`${t.text}-${i}`} label={`${t.text} · ${t.lang === 'hi' ? 'HI' : 'EN'}`} color={t.lang === 'hi' ? a.text : undefined} soft={t.lang === 'hi' ? a.soft : undefined} />
                ))}
              </View>
              <Text variant="caption" tone="tertiary">
                {hi} of {tokens.length} words read as Hinglish. Code-switched text is never auto-corrected.
              </Text>
            </View>
          ) : (
            <Text variant="caption" tone="tertiary" style={{ marginTop: space[3] }}>
              A preview of how Attune reads each word. Works even before you set it as your keyboard.
            </Text>
          )}
        </Card>
      </Reveal>

      <SectionHeader title="Learning together" />
      <Reveal index={3}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Sparkles size={20} color={a.text} strokeWidth={1.9} />
            <Text variant="title3" style={{ flex: 1 }}>
              Federated learning
            </Text>
            <Switch value={!!kb?.federated.joined} onChange={setJoined} color={a.base} disabled={!kb} accessibilityLabel="Join federated learning" />
          </View>
          <Text variant="callout" tone="secondary" style={{ marginTop: space[3] }}>
            Your phone learns from you. Only anonymous, noise-protected updates are shared, never your words.
          </Text>
          {kb ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[4], marginTop: space[5] }}>
              <Stat label="Rounds joined" value={String(kb.federated.rounds)} half />
              <Stat label="Model" value={kb.federated.modelVersion ?? 'Not yet'} half />
              <Stat label="Last sync" value={kb.federated.lastSync ? ago(kb.federated.lastSync) : 'Never'} half />
              <Stat label="Privacy budget ε" value={kb.federated.epsilon === null ? 'Not spent' : kb.federated.epsilon.toFixed(2)} half />
            </View>
          ) : (
            <Text variant="caption" tone="tertiary" style={{ marginTop: space[4] }}>
              Rounds, model version and privacy budget will show here once the keyboard has trained on your phone, at night, on Wi-Fi, while charging.
            </Text>
          )}
        </Card>
      </Reveal>

      <Button label="Set as system keyboard" color={a.base} full onPress={openKeyboardSettings} icon={<KeyboardIcon size={18} color={palette.ink[50]} strokeWidth={1.9} />} />

      <PrivacyCard
        senses="Which words you type and which you accept or reject."
        stays="Your personal word model is encrypted with the Android Keystore."
        never="Text never leaves the phone. Only clipped, noise-added model updates are uploaded."
      />
    </Screen>
  );
}

function Stat({ label, value, half }: { label: string; value: string; half?: boolean }) {
  return (
    <View style={{ gap: 2, width: half ? '50%' : undefined }}>
      <Text variant="title2" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

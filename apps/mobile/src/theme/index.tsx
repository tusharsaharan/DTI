import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { tokens, type ThemeColors, type FeatureKey } from '@attune/design-tokens';

export * from '@attune/design-tokens';

export interface Theme {
  scheme: 'dark' | 'light';
  c: ThemeColors;
  feature: (key: FeatureKey) => ThemeColors['feature'][FeatureKey];
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const scheme = system === 'light' ? 'light' : 'dark';
  const value = useMemo<Theme>(() => {
    const c = tokens.colors[scheme];
    return { scheme, c, feature: (key) => c.feature[key] };
  }, [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
}

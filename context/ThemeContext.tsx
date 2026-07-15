import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ColorPalette } from '../theme';

export type ThemeMode = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'readigma_theme';

type ThemeContextType = {
  isDark: boolean;
  colors: ColorPalette;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  // Kept for existing call sites: flips between an explicit light/dark
  // choice (same as picking that option directly), leaving 'system' mode.
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: darkColors,
  mode: 'system',
  setMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      setLoaded(true);
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';
  const toggleTheme = () => setMode(isDark ? 'light' : 'dark');
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  // Avoids a flash of the wrong theme while AsyncStorage resolves — usually
  // just one frame, same tradeoff app/_layout.tsx already makes for fonts.
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ isDark, colors, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { TimerProvider } from '../context/TimerContext';
import { AdConsentProvider } from '../context/AdConsentContext';
import TimerBubble from '../components/TimerBubble';
import BadgeToast from '../components/BadgeToast';
import AdConsentBanner from '../components/AdConsentBanner';
import { ColorPalette } from '../theme';
// Side-effect import: initializes i18next synchronously with its `resources`
// (no lazy backend), so every screen's useTranslation() is ready to render
// translated text on the very first paint — loadSavedLanguage() below only
// needs to run for the rarer case where the user has previously overridden
// the device-locale guess it starts with.
import '../lib/i18n';
import { loadSavedLanguage } from '../lib/i18n';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { session, loading, needsOnboarding } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const nativeSplashHidden = useRef(false);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isOnboardingRoute = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace(needsOnboarding ? '/onboarding' : '/(tabs)');
    } else if (session && needsOnboarding && !isOnboardingRoute) {
      router.replace('/onboarding');
    }
  }, [session, loading, segments, needsOnboarding]);

  useEffect(() => {
    if (!loading && !nativeSplashHidden.current) {
      nativeSplashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    const styles = makeLoadingStyles(colors);
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>📖 Readigma</Text>
        <ActivityIndicator color={colors.purple} size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="book/[id]" />
        <Stack.Screen name="goal" />
        <Stack.Screen name="friends/index" />
        <Stack.Screen name="friends/[id]" />
        <Stack.Screen name="suggest-book" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="help" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="import-goodreads" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
      </Stack>
      {session && <TimerBubble />}
      {session && <BadgeToast />}
      {session && <AdConsentBanner />}
    </>
  );
}

const makeLoadingStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    logo: { fontSize: 24, fontWeight: '800', color: colors.white, letterSpacing: 1 },
  });

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  // Native splash stays up until this resolves (RootNavigation's own effect
  // then keeps it up further, until auth's initial session check finishes) —
  // never renders a fallback system-serif flash of the heading font.
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Fraunces_700Bold });

  // RN Web renders every TouchableOpacity as a focusable <div tabindex="0">
  // with no `role` attribute at all, so clicking one (a Pill, a Button...)
  // leaves it focused and the browser draws its own blue focus ring on top
  // of our active-state styling — that's the stray outline around whichever
  // pill was tapped last. `[role="button"]` never matched anything (there's
  // no such attribute here); resetting focus outline on any tabbable element
  // is what actually removes it, including on the (real) `:focus-visible`
  // heuristic Chrome/Safari use for pointer-triggered focus.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `[tabindex]:focus, [tabindex]:focus-visible { outline: none !important; }`;
    document.head.appendChild(style);
  }, []);

  // The default Expo web template's viewport tag allows pinch/double-tap
  // zoom, which does two things: lets the page render at a slightly zoomed-
  // in initial scale instead of filling the screen edge to edge, and forces
  // mobile Safari/Chrome to add their ~300ms tap delay on every touch target
  // (they wait to see whether a second tap is coming, to tell a real tap
  // apart from a double-tap-to-zoom gesture) — which is what made a single
  // tap on a tab bar item feel like it needed a second tap to register.
  // Disabling zoom removes both symptoms at once; touch-action backs it up.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    // No viewport-fit=cover: it makes mobile Safari expose env(safe-area-inset-*),
    // and that value jumps as Safari's own address bar collapses/expands on
    // scroll, which made react-native-safe-area-context's top/bottom insets
    // change mid-session — a big gap appearing at the top and a blank strip
    // at the bottom. Desktop Safari/Chrome never had this since there's no
    // such chrome to hide, which is why it only showed up on mobile.
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');

    const style = document.createElement('style');
    // `cursor: pointer` isn't about mouse cursors here — it's the classic
    // workaround for iOS Safari's "standalone" (Add to Home Screen) mode,
    // where WebKit only fires click on the *second* tap unless the element
    // has a hover-eligible style, since it can't hover-preview on a device
    // with no cursor. Every RN Web touchable renders as a plain div with no
    // such style by default, which is what made switching tabs need two
    // taps specifically once the app was bookmarked to the home screen
    // (apple-mobile-web-app-capable below is what put it in that mode).
    style.textContent = `
      html, body { touch-action: manipulation; }
      [tabindex] { cursor: pointer; }
    `;
    document.head.appendChild(style);
  }, []);

  // web.output is "single" (a plain client-rendered SPA — "static"/"server"
  // output crashes this app's Supabase/AsyncStorage init under Node SSR), so
  // app/+html.tsx's build-time head customization never runs; these tags
  // only exist if injected after the JS loads, here. By the time someone
  // opens Safari's share sheet to "Add to Home Screen" the page has already
  // rendered, so the apple-touch-icon link below is present in the DOM and
  // gets picked up correctly despite being added at runtime, not build time.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const tags: HTMLElement[] = [];
    const addLink = (rel: string, href: string) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = href;
      document.head.appendChild(link);
      tags.push(link);
    };
    const addMeta = (name: string, content: string) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      tags.push(meta);
    };
    addLink('apple-touch-icon', '/apple-touch-icon.png');
    addLink('manifest', '/manifest.json');
    addMeta('theme-color', '#6B3F73');
    addMeta('apple-mobile-web-app-capable', 'yes');
    addMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    addMeta('apple-mobile-web-app-title', 'Readigma');
    return () => tags.forEach(t => t.remove());
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <TimerProvider>
              <AdConsentProvider>
                <RootNavigation />
                <ThemedStatusBar />
              </AdConsentProvider>
            </TimerProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

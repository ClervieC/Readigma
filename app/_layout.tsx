import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { ColorPalette } from '../theme';

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
    </Stack>
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
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootNavigation />
            <ThemedStatusBar />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

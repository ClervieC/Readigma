import Constants from 'expo-constants';
import { Platform } from 'react-native';

// The 2-3 Expo Router `+api.ts` routes (app/api/**) run as part of this very
// project, but a native app has no "same origin" to relatively fetch like a
// web page does — it needs the dev server's LAN address in development, or
// EXPO_PUBLIC_API_URL pointing at the deployed host in production.
function resolveApiBase() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') return '';
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:8081`;
  return '';
}

export const API_BASE = resolveApiBase();

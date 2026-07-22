import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' && { storage: AsyncStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// supabase.auth.getUser() re-verifies the JWT with the auth server on every
// call — fine once, wasteful for call sites that just want "my own id" to
// filter a query (RLS enforces that server-side regardless). Caching the id
// from onAuthStateChange (fires on init and every sign-in/out/refresh) gives
// every caller the current user id without a network round trip each time.
let cachedUserId: string | null | undefined;
let inFlightSession: Promise<string | undefined> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null;
});

export async function getCurrentUserId(): Promise<string | undefined> {
  if (cachedUserId !== undefined) return cachedUserId ?? undefined;
  if (!inFlightSession) {
    inFlightSession = supabase.auth
      .getSession()
      .then(({ data }) => {
        cachedUserId = data.session?.user?.id ?? null;
        return cachedUserId ?? undefined;
      })
      .finally(() => {
        inFlightSession = null;
      });
  }
  return inFlightSession;
}

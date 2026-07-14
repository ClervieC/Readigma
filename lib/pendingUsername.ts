import AsyncStorage from '@react-native-async-storage/async-storage';

// If the Supabase project requires email confirmation, signUp() returns no
// session yet — there's nothing to attach the typed username to at that
// point (RLS needs auth.uid(), which needs a real session). Stashed here and
// finished by AuthContext once the user's first real session appears (i.e.
// after confirming the email and logging in).
const KEY = 'readigma_pending_username';

export async function stashPendingUsername(username: string) {
  await AsyncStorage.setItem(KEY, username);
}

export async function consumePendingUsername(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY);
  if (value) await AsyncStorage.removeItem(KEY);
  return value;
}

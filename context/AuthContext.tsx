import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { stashPendingUsername, consumePendingUsername } from '../lib/pendingUsername';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  role: string;
  banned: boolean;
  onboarding_done: boolean;
};

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<{ needsEmailConfirmation: boolean }>;
  completeOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Derived from the account's own profile row (not device storage) — an
  // onboarding_done flag in AsyncStorage only marked *this device* as done,
  // so logging in from anywhere else (or after clearing site data) replayed
  // onboarding even though the account had already seen it. Server-side, it
  // only ever shows once per account, on any device.
  const needsOnboarding = !!profile && !profile.onboarding_done;

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    // Backstop for a session that was already open when an admin banned the
    // account — signIn() below catches the more common "banned, then tries
    // to log back in" case, but this kicks an already-signed-in banned user
    // out the next time their profile is (re)loaded (app focus, refresh...).
    if (data?.banned) {
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    setProfile(data as Profile | null);
  };

  const registerAndSavePush = (userId: string) => {
    registerForPushNotifications()
      .then((token) => {
        if (token) supabase.from('push_tokens').upsert({ user_id: userId, token }, { onConflict: 'user_id' }).then(() => {});
      })
      .catch(() => {});
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) setProfile(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      await loadProfile(session.user.id);
      if (!active) return;
      registerAndSavePush(session.user.id);
    })();
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  // Finishes provisioning the profile row for an account that signed up
  // needing email confirmation (see signUp() and lib/pendingUsername.ts) —
  // there was no session yet to attach the typed username to at that point.
  // First real session on this device (confirming the email, then logging
  // in) is what completes it; a no-op for every other login since there's
  // nothing pending by then.
  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      const pendingUsername = await consumePendingUsername();
      if (!pendingUsername || !active) return;
      const { data: existing } = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
      if (existing) return;
      await supabase.from('profiles').insert({ id: session.user.id, username: pendingUsername }).then(() => loadProfile(session.user.id));
    })();
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const { data: prof } = await supabase.from('profiles').select('banned').eq('id', data.user.id).maybeSingle();
    if (prof?.banned) {
      await supabase.auth.signOut();
      throw new Error('Ce compte a été suspendu. Contacte le support si tu penses qu\'il y a une erreur.');
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (data.session && data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, username });
      if (profileError) throw new Error(profileError.message);
      return { needsEmailConfirmation: false };
    }
    // No session back yet — Supabase project has email confirmation turned
    // on, so the profile row (needs a real user id) is created later, the
    // first time a confirmed session shows up (see the pendingUsername
    // effect above). app/(auth)/confirm-email.tsx tells the user to go
    // confirm, then sends them back to /login for their first real sign-in.
    await stashPendingUsername(username);
    return { needsEmailConfirmation: true };
  };

  const completeOnboarding = async () => {
    if (!session) return;
    setProfile(cur => (cur ? { ...cur, onboarding_done: true } : cur));
    await supabase.from('profiles').update({ onboarding_done: true }).eq('id', session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, needsOnboarding, signIn, signUp, completeOnboarding, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

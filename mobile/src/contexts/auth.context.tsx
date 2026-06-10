import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authService } from '../services/auth.service';
import api from '../services/api';

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

type AuthContextType = {
  isLoggedIn: boolean | null;
  needsOnboarding: boolean;
  serverReady: boolean;
  login: () => Promise<void>;
  completeOnboarding: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  useEffect(() => {
    // Ping health endpoint — this wakes Render's free tier if it was asleep
    api.get('/health', { timeout: 60000 })
      .catch(() => {})
      .finally(() => setServerReady(true));

    authService.isLoggedIn().then(async (loggedIn) => {
      setIsLoggedIn(loggedIn);
      if (loggedIn) {
        registerForPushNotifications()
          .then(token => { if (token) authService.savePushToken(token).catch(() => {}); })
          .catch(() => {});
      }
    });
  }, []);

  const login = async () => {
    const done = await AsyncStorage.getItem('readigma_onboarding_done');
    setNeedsOnboarding(!done);
    setIsLoggedIn(true);

    registerForPushNotifications()
      .then(token => { if (token) authService.savePushToken(token).catch(() => {}); })
      .catch(() => {});
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('readigma_onboarding_done', 'true');
    setNeedsOnboarding(false);
  };

  const logout = async () => {
    await authService.logout();
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, needsOnboarding, serverReady, login, completeOnboarding, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

import AsyncStorage from '@react-native-async-storage/async-storage';

// No server-side "seen" column for notifications — this is purely a local,
// per-device marker so the bell badge (see components/NotificationBell.tsx)
// clears once app/notifications.tsx has actually been opened, instead of
// staying stuck on a fixed "last 7 days" count forever.
const SEEN_AT_KEY = 'readigma_notifications_seen_at';

export async function getNotificationsSeenAt(): Promise<Date> {
  const stored = await AsyncStorage.getItem(SEEN_AT_KEY);
  return stored ? new Date(stored) : new Date(0);
}

export async function markNotificationsSeen(): Promise<void> {
  await AsyncStorage.setItem(SEEN_AT_KEY, new Date().toISOString());
}

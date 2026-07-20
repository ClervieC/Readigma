import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as follows from '../lib/follows';
import { getNotificationsSeenAt } from '../lib/notificationsSeen';

// Shared across every tab header so recent new followers are visible no
// matter which tab the user is on, not just Discover. Re-checks on every
// focus (not just mount) so the badge actually clears right after the user
// backs out of app/notifications.tsx, which is what marks them seen.
export default function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [recentCount, setRecentCount] = useState(0);

  useFocusEffect(useCallback(() => {
    Promise.all([follows.getRecentFollowers(), getNotificationsSeenAt()])
      .then(([recent, seenAt]) => setRecentCount(recent.filter((f) => new Date(f.created_at) > seenAt).length))
      .catch(() => {});
  }, []));

  return (
    <TouchableOpacity onPress={() => router.push('/notifications')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Feather name="bell" size={20} color={colors.white} />
      {recentCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{recentCount > 9 ? '9+' : recentCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    badge: {
      position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8,
      backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    badgeText: { fontSize: 9, color: 'white', fontWeight: '700' },
  });

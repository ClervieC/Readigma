import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as friends from '../lib/friends';

// Shared across every tab header so pending friend requests are visible no
// matter which tab the user is on, not just Discover.
export default function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [pendingCount, setPendingCount] = useState(0);

  useFocusEffect(useCallback(() => {
    friends.getPendingRequests().then((res) => setPendingCount(res.length)).catch(() => {});
  }, []));

  return (
    <TouchableOpacity onPress={() => router.push('/notifications')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Feather name="bell" size={20} color={colors.white} />
      {pendingCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
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

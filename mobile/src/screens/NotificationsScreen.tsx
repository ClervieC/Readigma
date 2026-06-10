import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, TouchableOpacity
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { feedService } from '../services/feed.service';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `Il y a ${mins}min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${days}j`;
}

export default function NotificationsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      feedService.getFeed().then(res => {
        // Filtrer les activités des amis comme notifications
        const notifs = res.data.map((item: any) => ({
          ...item,
          message: getNotifMessage(item),
          icon: getNotifIcon(item),
        }));
        setNotifications(notifs);
      }).catch(() => {});
    }, [])
  );

  const getNotifMessage = (item: any) => {
    switch (item.activity_type) {
      case 'finished': return `${item.username} a terminé "${item.book_title}"`;
      case 'reaction': return `${item.username} a réagi à "${item.book_title}"`;
      case 'progress_update': return `${item.username} a lu ${Math.round(item.metadata?.percent || 0)}% de "${item.book_title}"`;
      default: return `${item.username} a mis à jour sa lecture`;
    }
  };

  const getNotifIcon = (item: any) => {
    switch (item.activity_type) {
      case 'finished': return '🎉';
      case 'reaction': return item.emoji || '💭';
      case 'progress_update': return '📖';
      default: return '📚';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyText}>Les activités de tes amis apparaîtront ici !</Text>
          </View>
        ) : notifications.map((notif, i) => (
          <View key={i} style={styles.notifItem}>
            <View style={styles.notifIcon}>
              <Text style={{ fontSize: 22 }}>{notif.icon}</Text>
            </View>
            <View style={styles.notifContent}>
              <Text style={styles.notifMessage}>{notif.message}</Text>
              <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
            </View>
          </View>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  backBtn: { fontSize: 14, color: colors.lavender, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 40 },
  notifItem: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    padding: 14, backgroundColor: colors.card,
    borderRadius: radius.md, marginTop: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  notifIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(108,92,231,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 13, color: colors.white, lineHeight: 18 },
  notifTime: { fontSize: 11, color: colors.gray, marginTop: 3 },
});
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as feed from '../lib/feed';
import * as friends from '../lib/friends';

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

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [feedNotifs, setFeedNotifs] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    friends.getPendingRequests().then(setPendingRequests).catch(() => {});
    feed.getFeed().then(res => setFeedNotifs(res.map((item: any) => ({
      ...item, message: getNotifMessage(item), icon: getNotifIcon(item),
    })))).catch(() => {});
  }, []));

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

  const acceptRequest = (req: any) => {
    friends.acceptRequest(req.id).then(() => {
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
      Alert.alert('🎉', `Tu es maintenant ami avec @${req.username} !`);
    }).catch(() => Alert.alert('Erreur', 'Impossible d\'accepter'));
  };

  const declineRequest = (req: any) => {
    friends.declineRequest(req.id).then(() => {
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
    }).catch(() => Alert.alert('Erreur', 'Impossible de refuser'));
  };

  const hasContent = pendingRequests.length > 0 || feedNotifs.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {!hasContent && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyText}>Les demandes d'amis et activités de tes amis apparaîtront ici !</Text>
          </View>
        )}
        {pendingRequests.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Demandes d'amis</Text>
            {pendingRequests.map((req, i) => (
              <View key={i} style={[styles.notifItem, styles.friendRequestItem]}>
                <View style={[styles.notifIcon, styles.friendRequestIcon]}>
                  <Text style={{ fontSize: 20 }}>👥</Text>
                </View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifMessage}><Text style={styles.notifBold}>@{req.username}</Text>{' '}veut être ton ami lecteur</Text>
                  <Text style={styles.notifTime}>{timeAgo(req.created_at)}</Text>
                </View>
                <View style={styles.requestBtns}>
                  <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(req)}>
                    <Text style={styles.declineBtnText}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(req)}>
                    <Text style={styles.acceptBtnText}>Accepter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
        {feedNotifs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Activité des amis</Text>
            {feedNotifs.map((notif, i) => (
              <View key={i} style={styles.notifItem}>
                <View style={styles.notifIcon}><Text style={{ fontSize: 22 }}>{notif.icon}</Text></View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifMessage}>{notif.message}</Text>
                  <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { fontSize: 14, color: colors.lavender, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 40 },
  notifItem: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, backgroundColor: colors.card, borderRadius: radius.md, marginBottom: 8, borderWidth: 1, borderColor: colors.divider },
  friendRequestItem: { borderColor: colors.border, backgroundColor: colors.purpleGlow },
  notifIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(107,63,115,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  friendRequestIcon: { backgroundColor: 'rgba(107,63,115,0.2)' },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 13, color: colors.white, lineHeight: 18 },
  notifBold: { fontWeight: '700', color: colors.lavender },
  notifTime: { fontSize: 11, color: colors.gray, marginTop: 3 },
  acceptBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.cyan, borderRadius: 20, flexShrink: 0 },
  acceptBtnText: { color: colors.bg, fontSize: 12, fontWeight: '700' },
  requestBtns: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  declineBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  declineBtnText: { color: colors.gray, fontSize: 13, fontWeight: '700' },
});

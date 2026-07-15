import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as feed from '../lib/feed';
import * as friends from '../lib/friends';
import Screen from '../components/Screen';
import Row from '../components/Row';

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

const NOTIF_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  finished: 'check-circle',
  reaction: 'message-circle',
  progress_update: 'book-open',
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [feedNotifs, setFeedNotifs] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    friends.getPendingRequests().then(setPendingRequests).catch(() => {});
    feed.getFeed().then(res => setFeedNotifs(res.map((item: any) => ({ ...item, message: getNotifMessage(item) })))).catch(() => {});
  }, []));

  const getNotifMessage = (item: any) => {
    switch (item.activity_type) {
      case 'finished': return `${item.username} a terminé "${item.book_title}"`;
      case 'reaction': return `${item.username} a réagi à "${item.book_title}"`;
      case 'progress_update': return `${item.username} a lu ${Math.round(item.metadata?.percent || 0)}% de "${item.book_title}"`;
      default: return `${item.username} a mis à jour sa lecture`;
    }
  };

  const acceptRequest = (req: any) => {
    friends.acceptRequest(req.id).then(() => {
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
    }).catch(() => Alert.alert('Erreur', 'Impossible d\'accepter'));
  };

  const declineRequest = (req: any) => {
    friends.declineRequest(req.id).then(() => {
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
    }).catch(() => Alert.alert('Erreur', 'Impossible de refuser'));
  };

  const hasContent = pendingRequests.length > 0 || feedNotifs.length > 0;

  return (
    <Screen back title="Notifications">
      {!hasContent && (
        <View style={styles.emptyState}>
          <Feather name="bell" size={32} color={colors.gray} />
          <Text style={styles.emptyTitle}>Aucune notification</Text>
          <Text style={styles.emptyText}>Les demandes d'amis et activités de tes amis apparaîtront ici.</Text>
        </View>
      )}

      {pendingRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Demandes d'amis</Text>
          {pendingRequests.map((req, i) => (
            <Row key={i} last={i === pendingRequests.length - 1}
              icon={<View style={styles.notifIcon}><Feather name="user-plus" size={16} color={colors.lavender} /></View>}
              right={
                <View style={styles.requestBtns}>
                  <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(req)} hitSlop={8}>
                    <Feather name="x" size={14} color={colors.gray} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(req)}>
                    <Text style={styles.acceptBtnText}>Accepter</Text>
                  </TouchableOpacity>
                </View>
              }>
              <Text style={styles.notifMessage}><Text style={styles.notifBold}>@{req.username}</Text> veut être ton ami lecteur</Text>
              <Text style={styles.notifTime}>{timeAgo(req.created_at)}</Text>
            </Row>
          ))}
        </>
      )}

      {feedNotifs.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Activité des amis</Text>
          {feedNotifs.map((notif, i) => (
            <Row key={i} last={i === feedNotifs.length - 1}
              icon={<View style={styles.notifIcon}><Feather name={NOTIF_ICON[notif.activity_type] ?? 'book'} size={16} color={colors.lavender} /></View>}>
              <Text style={styles.notifMessage}>{notif.message}</Text>
              <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
            </Row>
          ))}
        </>
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  sectionTitle: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 20, marginBottom: 8 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 30 },
  notifIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purpleGlow, alignItems: 'center', justifyContent: 'center' },
  notifMessage: { fontSize: 13, color: colors.white, lineHeight: 18 },
  notifBold: { fontWeight: '700', color: colors.lavender },
  notifTime: { fontSize: 11, color: colors.gray, marginTop: 3 },
  acceptBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.purple, borderRadius: 20 },
  acceptBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  requestBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  declineBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

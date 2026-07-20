import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as feed from '../lib/feed';
import * as follows from '../lib/follows';
import { markNotificationsSeen } from '../lib/notificationsSeen';
import { getCurrentUserId } from '../lib/supabase';
import Screen from '../components/Screen';
import Row from '../components/Row';

// Mirrors app/(tabs)/feed.tsx's timeAgo — a plain function, not a component,
// so it takes `t` as a parameter instead of calling useTranslation() itself.
function timeAgo(dateStr: string, t: (key: string, opts?: any) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return t('feed.timeJustNow');
  if (mins < 60) return t('feed.timeMinutes', { count: mins });
  if (hours < 24) return t('feed.timeHours', { count: hours });
  return t('feed.timeDays', { count: days });
}

const NOTIF_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  finished: 'check-circle',
  reaction: 'message-circle',
  progress_update: 'book-open',
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const [recentFollowers, setRecentFollowers] = useState<any[]>([]);
  const [feedNotifs, setFeedNotifs] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    follows.getRecentFollowers().then(setRecentFollowers).catch(() => {});
    // get_feed() also returns the caller's own activity (that's by design for
    // the main feed screen), but notifications should only ever be about
    // what people you follow did — otherwise every action you take shows up
    // as a "notification" about yourself.
    getCurrentUserId().then(myId => {
      feed.getFeed().then(res => setFeedNotifs(
        res.filter((item: any) => item.user_id !== myId).map((item: any) => ({ ...item, message: getNotifMessage(item) }))
      )).catch(() => {});
    });
    // Marked seen on the way *out* rather than on open — this way the bell
    // badge (components/NotificationBell.tsx) still shows while this screen
    // is on top, and only clears once the user has actually looked and left,
    // instead of vanishing the instant the list starts loading.
    return () => { markNotificationsSeen(); };
  }, []));

  const getNotifMessage = (item: any) => {
    switch (item.activity_type) {
      case 'finished': return `${item.username} ${t('notifications.finished', { title: item.book_title })}`;
      case 'reaction': return `${item.username} ${t('notifications.reaction', { title: item.book_title })}`;
      case 'progress_update': return `${item.username} ${t('notifications.progressUpdate', { percent: Math.round(item.metadata?.percent || 0), title: item.book_title })}`;
      default: return `${item.username} ${t('notifications.defaultActivity')}`;
    }
  };

  const hasContent = recentFollowers.length > 0 || feedNotifs.length > 0;

  return (
    <Screen back title={t('notifications.title')}>
      {!hasContent && (
        <View style={styles.emptyState}>
          <Feather name="bell" size={32} color={colors.gray} />
          <Text style={styles.emptyTitle}>{t('notifications.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('notifications.emptyText')}</Text>
        </View>
      )}

      {recentFollowers.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('notifications.newFollowers')}</Text>
          {recentFollowers.map((user, i) => (
            <TouchableOpacity key={i} onPress={() => router.push({ pathname: '/friends/[id]', params: { id: user.id, username: user.username } })}>
              <Row last={i === recentFollowers.length - 1}
                icon={<View style={styles.notifIcon}><Feather name="user-plus" size={16} color={colors.lavender} /></View>}>
                <Text style={styles.notifMessage}><Text style={styles.notifBold}>@{user.username}</Text> {t('notifications.startedFollowing')}</Text>
                <Text style={styles.notifTime}>{timeAgo(user.created_at, t)}</Text>
              </Row>
            </TouchableOpacity>
          ))}
        </>
      )}

      {feedNotifs.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('notifications.followedActivity')}</Text>
          {feedNotifs.map((notif, i) => (
            <Row key={i} last={i === feedNotifs.length - 1}
              icon={<View style={styles.notifIcon}><Feather name={NOTIF_ICON[notif.activity_type] ?? 'book'} size={16} color={colors.lavender} /></View>}>
              <Text style={styles.notifMessage}>{notif.message}</Text>
              <Text style={styles.notifTime}>{timeAgo(notif.created_at, t)}</Text>
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
});

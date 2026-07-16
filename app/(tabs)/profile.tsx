import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { radius, fonts, ColorPalette } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as userBooks from '../../lib/userBooks';
import * as timer from '../../lib/timer';
import { formatDuration } from '../../lib/timer';
import Row from '../../components/Row';
import NotificationBell from '../../components/NotificationBell';
import { onScrollToTop } from '../../lib/tabScrollEmitter';
import { useTheme } from '../../context/ThemeContext';

const QUICK_LINKS: { icon: keyof typeof Feather.glyphMap; label: string; route: string }[] = [
  { icon: 'bar-chart-2', label: 'Statistiques', route: '/stats' },
  { icon: 'award', label: 'Badges', route: '/badges' },
  { icon: 'target', label: 'Reading Goal', route: '/goal' },
  { icon: 'users', label: 'Mes amis lecteurs', route: '/friends' },
  { icon: 'bell', label: 'Notifications', route: '/notifications' },
  { icon: 'send', label: 'Suggérer un livre', route: '/suggest-book' },
];

export default function ProfileScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [formatStats, setFormatStats] = useState({ physical_count: 0, ereader_count: 0 });
  const [monthSeconds, setMonthSeconds] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    userBooks.getMyBooks().then(res => setAllBooks(res)).catch(() => {});
    userBooks.getFormatStats().then(setFormatStats).catch(() => {});
    timer.getReadingTimeStats().then(res => setMonthSeconds(res.month_seconds)).catch(() => {});
  }, []));

  useEffect(() => onScrollToTop('profile', () => scrollRef.current?.scrollTo({ y: 0, animated: true })), []);

  const counts: any = { done: 0, to_read: 0, reading: 0, dnf: 0 };
  allBooks.forEach(b => { if (counts[b.status] !== undefined) counts[b.status]++; });

  const getAvgRating = () => {
    const rated = allBooks.filter(b => b.rating);
    if (!rated.length) return '—';
    return (rated.reduce((sum, b) => sum + parseFloat(b.rating), 0) / rated.length).toFixed(1) + '★';
  };

  const formatTotal = formatStats.physical_count + formatStats.ereader_count;
  const physicalPct = formatTotal > 0 ? Math.round((formatStats.physical_count / formatTotal) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <NotificationBell />
          <TouchableOpacity onPress={() => router.push('/settings')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="settings" size={19} color={colors.gray} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => router.push('/edit-profile')}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile?.username?.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.username}</Text>
            {profile?.role === 'admin' && (
              <View style={styles.adminBadge}>
                <Feather name="shield" size={10} color="white" />
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>
          <Text style={styles.handle}>@{profile?.username?.toLowerCase()}</Text>
        </View>

        <View style={styles.statsGrid}>
          {[
            { num: counts.done, label: 'Lus' },
            { num: counts.to_read, label: 'À lire' },
            { num: getAvgRating(), label: 'Moy.' },
            { num: counts.reading, label: 'En cours' },
          ].map((s, i) => (
            <View key={i} style={styles.statBox}>
              <Text style={styles.statNum}>{s.num}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {monthSeconds > 0 && (
          <View style={styles.timeRow}>
            <Text style={styles.timeCardLabel}>Temps de lecture ce mois-ci</Text>
            <Text style={styles.timeCardValue}>{formatDuration(monthSeconds)}</Text>
          </View>
        )}

        {formatTotal > 0 && (
          <View style={styles.formatSplitCard}>
            <Text style={styles.sectionLabel}>Format de lecture</Text>
            <View style={styles.formatSplitRow}>
              <Text style={styles.formatSplitLabel}>{physicalPct}% physique</Text>
              <View style={styles.formatSplitBar}>
                <View style={[styles.formatSplitFillA, { width: `${physicalPct}%` as any }]} />
                <View style={[styles.formatSplitFillB, { width: `${100 - physicalPct}%` as any }]} />
              </View>
              <Text style={styles.formatSplitLabel}>{100 - physicalPct}% liseuse</Text>
            </View>
          </View>
        )}

        <View>
          {profile?.role === 'admin' && (
            <Row onPress={() => router.push('/admin')} chevron
              icon={<Feather name="shield" size={18} color={colors.purple} />}>
              <Text style={styles.settingLabel}>Administration</Text>
            </Row>
          )}
          {QUICK_LINKS.map((item) => (
            <Row key={item.route} onPress={() => router.push(item.route as any)} chevron
              icon={<Feather name={item.icon} size={18} color={colors.white} />}>
              <Text style={styles.settingLabel}>{item.label}</Text>
            </Row>
          ))}
          <Row last onPress={() => router.push('/contact')} chevron
            icon={<Feather name="mail" size={18} color={colors.white} />}>
            <Text style={styles.settingLabel}>Écrire à l'équipe</Text>
          </Row>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 20 },
  hero: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 26, fontWeight: '700', color: 'white' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white },
  handle: { fontSize: 12, color: colors.gray, marginTop: 3 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.purple, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  adminBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  avatarImg: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', marginBottom: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 19, fontFamily: fonts.heading, color: colors.purple },
  statLabel: { fontSize: 9, color: colors.gray, marginTop: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  timeCardLabel: { fontSize: 13, color: colors.gray },
  timeCardValue: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.purple },
  formatSplitCard: { marginBottom: 24 },
  formatSplitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatSplitLabel: { fontSize: 11, color: colors.gray },
  formatSplitBar: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.card2 },
  formatSplitFillA: { backgroundColor: colors.purple },
  formatSplitFillB: { backgroundColor: colors.teal },
  sectionLabel: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  settingLabel: { fontSize: 14, color: colors.white },
});

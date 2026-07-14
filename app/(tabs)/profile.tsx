import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Image, Switch } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { radius, fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import * as userBooks from '../../lib/userBooks';
import * as timer from '../../lib/timer';
import { formatDuration } from '../../lib/timer';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [formatStats, setFormatStats] = useState({ physical_count: 0, ereader_count: 0 });
  const [monthSeconds, setMonthSeconds] = useState(0);

  useFocusEffect(useCallback(() => {
    userBooks.getMyBooks().then(res => setAllBooks(res)).catch(() => {});
    userBooks.getFormatStats().then(setFormatStats).catch(() => {});
    timer.getReadingTimeStats().then(res => setMonthSeconds(res.month_seconds)).catch(() => {});
  }, []));

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={signOut}>
          <Text style={{ fontSize: 18 }}>🚪</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => router.push('/edit-profile')}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile?.username?.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.editAvatarHint}>Modifier</Text>
          </TouchableOpacity>
          <Text style={styles.name}>{profile?.username}</Text>
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
          <View style={styles.timeCard}>
            <Text style={styles.timeCardLabel}>⏱ Temps de lecture ce mois-ci</Text>
            <Text style={styles.timeCardValue}>{formatDuration(monthSeconds)}</Text>
          </View>
        )}

        {formatTotal > 0 && (
          <View style={styles.formatSplitCard}>
            <Text style={styles.sectionLabel}>Format de lecture</Text>
            <View style={styles.formatSplitRow}>
              <Text style={styles.formatSplitLabel}>📖 {physicalPct}%</Text>
              <View style={styles.formatSplitBar}>
                <View style={[styles.formatSplitFillA, { width: `${physicalPct}%` as any }]} />
                <View style={[styles.formatSplitFillB, { width: `${100 - physicalPct}%` as any }]} />
              </View>
              <Text style={styles.formatSplitLabel}>{100 - physicalPct}% 📱</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>Paramètres</Text>
        <View style={styles.settingsList}>
          {[
            { icon: '✏️', label: 'Modifier le profil', onPress: () => router.push('/edit-profile') },
            { icon: '🎯', label: 'Reading Goal', onPress: () => router.push('/goal') },
            { icon: '👥', label: 'Mes amis lecteurs', onPress: () => router.push('/friends') },
            { icon: '🔔', label: 'Notifications', onPress: () => router.push('/notifications') },
            { icon: '💡', label: 'Suggérer un livre', onPress: () => router.push('/suggest-book') },
            { icon: '❓', label: 'Aide & Contact', onPress: () => router.push('/help') },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.settingItem} onPress={item.onPress}>
              <Text style={styles.settingIcon}>{item.icon}</Text>
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Text style={{ color: colors.gray }}>›</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.settingItem}>
            <Text style={styles.settingIcon}>{isDark ? '🌙' : '☀️'}</Text>
            <Text style={styles.settingLabel}>{isDark ? 'Mode sombre' : 'Mode clair'}</Text>
            <Switch
              value={!isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.card2, true: colors.purpleGlow }}
              thumbColor={isDark ? colors.gray : colors.purple}
            />
          </View>

          <TouchableOpacity style={[styles.settingItem, { borderBottomWidth: 0 }]} onPress={signOut}>
            <Text style={styles.settingIcon}>🚪</Text>
            <Text style={[styles.settingLabel, { color: colors.error }]}>Se déconnecter</Text>
            <Text style={{ color: colors.gray }}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 20, fontFamily: fonts.headingBold, color: colors.white },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 26, fontWeight: '700', color: 'white' },
  name: { fontSize: 20, fontFamily: fonts.headingBold, color: colors.white },
  handle: { fontSize: 12, color: colors.gray, marginTop: 3 },
  avatarImg: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  editAvatarHint: { fontSize: 10, color: colors.lavender, textAlign: 'center', marginBottom: 6 },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.divider },
  statNum: { fontSize: 20, fontFamily: fonts.heading, color: colors.purple },
  statLabel: { fontSize: 9, color: colors.gray, marginTop: 2 },
  timeCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.divider, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeCardLabel: { fontSize: 13, color: colors.gray },
  timeCardValue: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.purple },
  formatSplitCard: { marginBottom: 16 },
  formatSplitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatSplitLabel: { fontSize: 12, color: colors.gray, width: 52 },
  formatSplitBar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.card2 },
  formatSplitFillA: { backgroundColor: colors.purple },
  formatSplitFillB: { backgroundColor: colors.teal },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.white, marginBottom: 12 },
  settingsList: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  settingIcon: { fontSize: 18 },
  settingLabel: { flex: 1, fontSize: 14, color: colors.white },
});

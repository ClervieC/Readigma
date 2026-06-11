import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Image, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../contexts/theme.context';
import { authService } from '../services/auth.service';
import { booksService } from '../services/books.service';
import { useAuth } from '../contexts/auth.context';

export default function ProfileScreen({ navigation }: any) {
  const { logout } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);
  const [user, setUser] = useState<any>(null);
  const [allBooks, setAllBooks] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    authService.getUser().then(setUser);
    booksService.getMyBooks().then(res => setAllBooks(res.data)).catch(() => {});
  }, []));

  const counts: any = { done: 0, to_read: 0, reading: 0, dnf: 0 };
  allBooks.forEach(b => { if (counts[b.status] !== undefined) counts[b.status]++; });

  const getAvgRating = () => {
    const rated = allBooks.filter(b => b.rating);
    if (!rated.length) return '—';
    return (rated.reduce((sum, b) => sum + parseFloat(b.rating), 0) / rated.length).toFixed(1) + '★';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={logout}>
          <Text style={{ fontSize: 18 }}>🚪</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate('EditProfile')}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.username?.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.editAvatarHint}>Modifier</Text>
          </TouchableOpacity>
          <Text style={styles.name}>{user?.username}</Text>
          <Text style={styles.handle}>@{user?.username?.toLowerCase()}</Text>
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

        <Text style={styles.sectionLabel}>Paramètres</Text>
        <View style={styles.settingsList}>
          {[
            { icon: '✏️', label: 'Modifier le profil', onPress: () => navigation.getParent()?.navigate('EditProfile') },
            { icon: '🎯', label: 'Reading Goal', onPress: () => navigation.getParent()?.navigate('Goal') },
            { icon: '👥', label: 'Mes amis lecteurs', onPress: () => navigation.getParent()?.navigate('Friends') },
            { icon: '🔔', label: 'Notifications', onPress: () => navigation.getParent()?.navigate('Notifications') },
            { icon: '💡', label: 'Suggérer un livre', onPress: () => navigation.getParent()?.navigate('SuggestBook') },
            { icon: '❓', label: 'Aide & Contact', onPress: () => navigation.getParent()?.navigate('Help') },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.settingItem} onPress={item.onPress}>
              <Text style={styles.settingIcon}>{item.icon}</Text>
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Text style={{ color: colors.gray }}>›</Text>
            </TouchableOpacity>
          ))}

          {/* Theme toggle */}
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

          <TouchableOpacity style={[styles.settingItem, { borderBottomWidth: 0 }]} onPress={logout}>
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
  title: { fontSize: 20, fontWeight: '700', color: colors.white },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 26, fontWeight: '700', color: 'white' },
  name: { fontSize: 18, fontWeight: '700', color: colors.white },
  handle: { fontSize: 12, color: colors.gray, marginTop: 3 },
  avatarImg: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  editAvatarHint: { fontSize: 10, color: colors.lavender, textAlign: 'center', marginBottom: 6 },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.divider },
  statNum: { fontSize: 18, fontWeight: '700', color: colors.purple },
  statLabel: { fontSize: 9, color: colors.gray, marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.white, marginBottom: 12 },
  settingsList: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  settingIcon: { fontSize: 18 },
  settingLabel: { flex: 1, fontSize: 14, color: colors.white },
});

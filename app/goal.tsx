import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, TextInput, Alert, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { radius, fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as goals from '../lib/goals';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function GoalScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [goal, setGoal] = useState<any>(null);
  const [booksRead, setBooksRead] = useState(0);
  const [target, setTarget] = useState('');
  const [monthly, setMonthly] = useState<{ month: number; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => { loadGoal(); }, []);

  const loadGoal = () => {
    goals.getGoal().then(res => {
      setGoal(res.goal);
      setBooksRead(res.books_read);
      if (res.goal) setTarget(res.goal.target_books.toString());
    }).catch(() => {});
    goals.getMonthly().then(setMonthly).catch(() => {});
  };

  const saveGoal = () => {
    const t = parseInt(target);
    if (isNaN(t) || t <= 0) { Alert.alert('Erreur', 'Entre un nombre valide'); return; }
    setLoading(true);
    goals.setGoal(t).then(() => {
      setLoading(false); loadGoal();
      Alert.alert('🎯', `Objectif de ${t} livres fixé pour ${year} !`);
    }).catch(() => { setLoading(false); Alert.alert('Erreur', 'Impossible de sauvegarder'); });
  };

  const progress = goal ? Math.min((booksRead / goal.target_books) * 100, 100) : 0;
  const maxMonthly = Math.max(...monthly.map(m => m.count), 1);
  const monthsLeft = 12 - currentMonth + 1;
  const booksLeft = goal ? Math.max(goal.target_books - booksRead, 0) : 0;
  const pace = monthsLeft > 0 ? (booksLeft / monthsLeft).toFixed(1) : '0';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reading Goal {year}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.goalCard}>
          <Text style={styles.goalEmoji}>🎯</Text>
          <Text style={styles.goalTitle}>Mon objectif {year}</Text>
          {goal ? (
            <>
              <Text style={styles.goalNumbers}>
                <Text style={styles.goalCurrent}>{booksRead}</Text>
                <Text style={styles.goalSeparator}> / </Text>
                <Text style={styles.goalTarget}>{goal.target_books}</Text>
                <Text style={styles.goalLabel}> livres</Text>
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(progress)}% accompli</Text>
              {progress >= 100 ? (
                <View style={styles.congratsBadge}>
                  <Text style={styles.congratsText}>🎉 Objectif atteint ! Bravo !</Text>
                </View>
              ) : (
                <View style={styles.paceRow}>
                  <View style={styles.paceStat}>
                    <Text style={styles.paceNum}>{booksLeft}</Text>
                    <Text style={styles.paceLabel}>livres restants</Text>
                  </View>
                  <View style={styles.paceDivider} />
                  <View style={styles.paceStat}>
                    <Text style={styles.paceNum}>{pace}</Text>
                    <Text style={styles.paceLabel}>livres/mois</Text>
                  </View>
                  <View style={styles.paceDivider} />
                  <View style={styles.paceStat}>
                    <Text style={styles.paceNum}>{monthsLeft}</Text>
                    <Text style={styles.paceLabel}>mois restants</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.noGoal}>Pas encore d'objectif pour {year}</Text>
          )}
        </View>

        {monthly.some(m => m.count > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Mois par mois</Text>
            <View style={styles.chart}>
              {monthly.map((m) => {
                const barH = maxMonthly > 0 ? (m.count / maxMonthly) * 80 : 0;
                const isCurrent = m.month === currentMonth;
                return (
                  <View key={m.month} style={styles.barCol}>
                    <Text style={styles.barCount}>{m.count > 0 ? m.count : ''}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { height: Math.max(barH, m.count > 0 ? 4 : 0) }, isCurrent && styles.barFillCurrent]} />
                    </View>
                    <Text style={[styles.barLabel, isCurrent && styles.barLabelCurrent]}>{MONTHS[m.month - 1]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{goal ? 'Modifier mon objectif' : 'Définir mon objectif'}</Text>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={target} onChangeText={setTarget}
              keyboardType="number-pad" placeholder="Ex: 24" placeholderTextColor={colors.gray} />
            <Text style={styles.inputSuffix}>livres en {year}</Text>
          </View>
          <View style={styles.suggestions}>
            {[12, 24, 36, 52].map(n => (
              <TouchableOpacity key={n} style={[styles.suggestionChip, target === n.toString() && styles.suggestionChipActive]}
                onPress={() => setTarget(n.toString())}>
                <Text style={[styles.suggestionText, target === n.toString() && styles.suggestionTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveGoal} disabled={loading}>
            <Text style={styles.saveBtnText}>{loading ? 'Sauvegarde...' : '🎯 Sauvegarder'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
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
  goalCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 24, alignItems: 'center', marginTop: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.divider },
  goalEmoji: { fontSize: 44, marginBottom: 8 },
  goalTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 16 },
  goalNumbers: { marginBottom: 12 },
  goalCurrent: { fontSize: 38, fontFamily: fonts.headingBold, color: colors.cyan },
  goalSeparator: { fontSize: 24, color: colors.gray },
  goalTarget: { fontSize: 38, fontFamily: fonts.headingBold, color: colors.lavender },
  goalLabel: { fontSize: 16, color: colors.gray },
  progressBar: { width: '100%', height: 8, backgroundColor: colors.card2, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: colors.cyan, borderRadius: 4 },
  progressText: { fontSize: 12, color: colors.cyan, marginBottom: 16 },
  congratsBadge: { backgroundColor: 'rgba(107,63,115,0.15)', borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  congratsText: { fontSize: 15, color: colors.lavender, fontWeight: '700' },
  paceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  paceStat: { flex: 1, alignItems: 'center', gap: 3 },
  paceNum: { fontSize: 20, fontWeight: '800', color: colors.white },
  paceLabel: { fontSize: 10, color: colors.gray, textAlign: 'center' },
  paceDivider: { width: 1, height: 30, backgroundColor: colors.divider },
  noGoal: { fontSize: 14, color: colors.gray, textAlign: 'center' },
  section: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.divider },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginBottom: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barCount: { fontSize: 9, color: colors.muted, height: 12, textAlign: 'center' },
  barTrack: { height: 80, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  barFill: { width: '70%', backgroundColor: colors.purple, borderRadius: 3 },
  barFillCurrent: { backgroundColor: colors.cyan },
  barLabel: { fontSize: 8, color: colors.gray, textAlign: 'center' },
  barLabelCurrent: { color: colors.cyan, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  input: { width: 80, backgroundColor: colors.card2, borderRadius: radius.sm, padding: 12, color: colors.white, fontSize: 24, fontWeight: '700', borderWidth: 1, borderColor: colors.divider, textAlign: 'center' },
  inputSuffix: { fontSize: 14, color: colors.gray },
  suggestions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  suggestionChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.card2, borderRadius: 20, borderWidth: 1, borderColor: colors.divider },
  suggestionChipActive: { backgroundColor: colors.purpleGlow, borderColor: colors.border },
  suggestionText: { color: colors.lavender, fontSize: 13, fontWeight: '500' },
  suggestionTextActive: { color: colors.white, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  saveBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
});

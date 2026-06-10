import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, TextInput, Alert
} from 'react-native';
import { colors, radius } from '../theme';
import { goalsService } from '../services/goals.service';

export default function GoalScreen({ navigation }: any) {
  const [goal, setGoal] = useState<any>(null);
  const [booksRead, setBooksRead] = useState(0);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => { loadGoal(); }, []);

  const loadGoal = () => {
    goalsService.getGoal().then(res => {
      setGoal(res.data.goal);
      setBooksRead(res.data.books_read);
      if (res.data.goal) setTarget(res.data.goal.target_books.toString());
    }).catch(() => {});
  };

  const saveGoal = () => {
    const t = parseInt(target);
    if (isNaN(t) || t <= 0) { Alert.alert('Erreur', 'Entre un nombre valide'); return; }
    setLoading(true);
    goalsService.setGoal(t).then(() => {
      setLoading(false);
      loadGoal();
      Alert.alert('🎯', `Objectif de ${t} livres fixé pour ${year} !`);
    }).catch(() => {
      setLoading(false);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    });
  };

  const progress = goal ? Math.min((booksRead / goal.target_books) * 100, 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reading Goal {year}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
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

              {progress >= 100 && (
                <Text style={styles.congrats}>🎉 Objectif atteint ! Bravo !</Text>
              )}
            </>
          ) : (
            <Text style={styles.noGoal}>Pas encore d'objectif pour {year}</Text>
          )}
        </View>

        <View style={styles.setGoalCard}>
          <Text style={styles.setGoalTitle}>
            {goal ? 'Modifier mon objectif' : 'Définir mon objectif'}
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={target}
              onChangeText={setTarget}
              keyboardType="number-pad"
              placeholder="Ex: 24"
              placeholderTextColor={colors.gray}
            />
            <Text style={styles.inputSuffix}>livres en {year}</Text>
          </View>

          <View style={styles.suggestions}>
            {[12, 24, 36, 52].map(n => (
              <TouchableOpacity
                key={n}
                style={styles.suggestionChip}
                onPress={() => setTarget(n.toString())}
              >
                <Text style={styles.suggestionText}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={saveGoal} disabled={loading}>
            <Text style={styles.saveBtnText}>{loading ? 'Sauvegarde...' : '🎯 Sauvegarder'}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  content: { flex: 1, padding: 16 },
  goalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: 24,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: colors.divider,
  },
  goalEmoji: { fontSize: 48, marginBottom: 8 },
  goalTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 16 },
  goalNumbers: { marginBottom: 12 },
  goalCurrent: { fontSize: 36, fontWeight: '700', color: colors.teal },
  goalSeparator: { fontSize: 24, color: colors.gray },
  goalTarget: { fontSize: 36, fontWeight: '700', color: colors.lavender },
  goalLabel: { fontSize: 16, color: colors.gray },
  progressBar: {
    width: '100%', height: 10,
    backgroundColor: colors.card2,
    borderRadius: 5, overflow: 'hidden', marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 5 },
  progressText: { fontSize: 13, color: colors.teal },
  congrats: { fontSize: 16, color: colors.purple, marginTop: 12, fontWeight: '700' },
  noGoal: { fontSize: 14, color: colors.gray, textAlign: 'center' },
  setGoalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: 20,
    borderWidth: 1, borderColor: colors.divider,
  },
  setGoalTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  input: {
    width: 80,
    backgroundColor: colors.card2,
    borderRadius: radius.sm, padding: 12,
    color: colors.white, fontSize: 24, fontWeight: '700',
    borderWidth: 1, borderColor: colors.divider,
    textAlign: 'center',
  },
  inputSuffix: { fontSize: 14, color: colors.gray },
  suggestions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  suggestionChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.card2,
    borderRadius: 20, borderWidth: 1, borderColor: colors.divider,
  },
  suggestionText: { color: colors.lavender, fontSize: 13, fontWeight: '500' },
  saveBtn: {
    backgroundColor: colors.purple,
    borderRadius: radius.md, padding: 14, alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
});
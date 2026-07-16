import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as reports from '../lib/reports';
import Screen from '../components/Screen';
import Button from '../components/Button';

const BOOK_REASONS = ['Informations incorrectes', 'Contenu inapproprié', 'Doublon', 'Autre'];
const USER_REASONS = ['Comportement abusif', 'Faux compte', 'Spam', 'Autre'];

// Generic report form for either a book or a user — reached from the "..."
// menu on app/book/[id].tsx and app/friends/[id].tsx, which pass targetType/
// targetId/label as params.
export default function ReportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { targetType, targetId, label } = useLocalSearchParams<{ targetType: 'book' | 'user'; targetId: string; label?: string }>();
  const reasons = targetType === 'user' ? USER_REASONS : BOOK_REASONS;
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const submit = () => {
    if (!targetType || !targetId) return;
    setSending(true);
    reports.submitReport(targetType, targetId, reason, details).then(() => {
      setSending(false);
      Alert.alert('Merci', 'Ton signalement a été envoyé à l\'équipe.', [{ text: 'OK', onPress: () => router.back() }]);
    }).catch(() => { setSending(false); Alert.alert('Erreur', "Impossible d'envoyer le signalement"); });
  };

  return (
    <Screen back title={targetType === 'user' ? 'Signaler ce profil' : 'Signaler ce livre'}>
      {label ? <Text style={styles.target}>{label}</Text> : null}

      <Text style={styles.label}>Motif</Text>
      {reasons.map((r) => (
        <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => setReason(r)}>
          <View style={[styles.radio, reason === r && styles.radioActive]}>
            {reason === r && <View style={styles.radioDot} />}
          </View>
          <Text style={styles.reasonText}>{r}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Détails (optionnel)</Text>
      <TextInput
        style={styles.input}
        value={details}
        onChangeText={setDetails}
        placeholder="Précise si besoin..."
        placeholderTextColor={colors.gray}
        multiline
        maxLength={500}
      />

      <Button label={sending ? 'Envoi...' : 'Envoyer le signalement'} variant="danger" onPress={submit} disabled={sending} style={{ marginTop: 20 }} />
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  target: { fontSize: 13, color: colors.gray, marginBottom: 20 },
  label: { fontSize: 11, color: colors.gray, marginBottom: 10, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.error },
  radioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.error },
  reasonText: { fontSize: 14, color: colors.white },
  input: {
    borderWidth: 1, borderColor: colors.divider, borderRadius: 10, padding: 12,
    color: colors.white, fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginTop: 6,
  },
});

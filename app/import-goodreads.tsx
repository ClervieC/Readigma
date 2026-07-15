import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { fonts, radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { importGoodreadsCsv, ImportProgress } from '../lib/goodreadsImport';
import Screen from '../components/Screen';
import Button from '../components/Button';

type Status = 'idle' | 'reading' | 'importing' | 'done' | 'error';

export default function ImportGoodreadsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<{ booksCount: number; importedCount: number } | null>(null);
  const [error, setError] = useState('');

  const pickAndImport = async () => {
    setError('');
    const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', '*/*'] });
    if (picked.canceled || !picked.assets?.[0]) return;

    try {
      setStatus('reading');
      const res = await fetch(picked.assets[0].uri);
      const text = await res.text();
      setStatus('importing');
      const outcome = await importGoodreadsCsv(text, setProgress);
      setResult(outcome);
      setStatus('done');
    } catch (e: any) {
      setError(e.message || "Erreur lors de l'import");
      setStatus('error');
    }
  };

  const progressLabel = () => {
    if (!progress) return 'Import en cours...';
    if (progress.phase === 'books') return `Livres : ${progress.current}/${progress.total}`;
    return `Ajout à ta bibliothèque : ${progress.current}/${progress.total}`;
  };

  return (
    <Screen back title="Importer depuis Goodreads">
      <View style={styles.hero}>
        <Feather name="upload" size={28} color={colors.purple} />
        <Text style={styles.heroTitle}>Importer ta bibliothèque Goodreads</Text>
        <Text style={styles.heroSub}>
          Sur Goodreads : Mes Livres → Outils → Importer/Exporter → "Export Library". Choisis ensuite le fichier .csv téléchargé ci-dessous.
        </Text>
      </View>

      {(status === 'idle' || status === 'error') && (
        <Button label="Choisir un fichier CSV" onPress={pickAndImport} />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {(status === 'reading' || status === 'importing') && (
        <View style={styles.progressBox}>
          <ActivityIndicator color={colors.purple} />
          <Text style={styles.progressText}>{status === 'reading' ? 'Lecture du fichier...' : progressLabel()}</Text>
        </View>
      )}

      {status === 'done' && result && (
        <View style={styles.doneBox}>
          <Feather name="check-circle" size={32} color={colors.teal} />
          <Text style={styles.doneTitle}>Import terminé</Text>
          <Text style={styles.doneSub}>
            {result.importedCount} livre{result.importedCount > 1 ? 's' : ''} ajouté{result.importedCount > 1 ? 's' : ''} à ta bibliothèque, tous en format liseuse.
          </Text>
          <Button label="Voir ma bibliothèque" onPress={() => router.push('/(tabs)/library')} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        </View>
      )}

      <Text style={styles.note}>
        Le statut (à lire / en cours / lu), la note et la série sont repris directement de ton export Goodreads. Réimporter le même fichier plus tard ne crée pas de doublons.
      </Text>
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  heroTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 8, lineHeight: 19 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center', marginTop: 12 },
  progressBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  progressText: { fontSize: 13, color: colors.gray },
  doneBox: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  doneTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  doneSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 12 },
  note: { fontSize: 11, color: colors.gray, textAlign: 'center', marginTop: 28, lineHeight: 16 },
});

import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setError(e.message || t('importGoodreads.errors.importFailed'));
      setStatus('error');
    }
  };

  const progressLabel = () => {
    if (!progress) return t('importGoodreads.importing');
    if (progress.phase === 'books') return t('importGoodreads.booksProgress', { current: progress.current, total: progress.total });
    return t('importGoodreads.addingToLibrary', { current: progress.current, total: progress.total });
  };

  return (
    <Screen back title={t('importGoodreads.title')}>
      <View style={styles.hero}>
        <Feather name="upload" size={28} color={colors.purple} />
        <Text style={styles.heroTitle}>{t('importGoodreads.heroTitle')}</Text>
        <Text style={styles.heroSub}>
          {t('importGoodreads.heroSub')}
        </Text>
      </View>

      {(status === 'idle' || status === 'error') && (
        <Button label={t('importGoodreads.chooseCsv')} onPress={pickAndImport} />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {(status === 'reading' || status === 'importing') && (
        <View style={styles.progressBox}>
          <ActivityIndicator color={colors.purple} />
          <Text style={styles.progressText}>{status === 'reading' ? t('importGoodreads.readingFile') : progressLabel()}</Text>
        </View>
      )}

      {status === 'done' && result && (
        <View style={styles.doneBox}>
          <Feather name="check-circle" size={32} color={colors.teal} />
          <Text style={styles.doneTitle}>{t('importGoodreads.importDone')}</Text>
          <Text style={styles.doneSub}>
            {t('importGoodreads.importedCount', { count: result.importedCount })}
          </Text>
          <Button label={t('importGoodreads.viewLibrary')} onPress={() => router.push('/(tabs)/library')} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        </View>
      )}

      <Text style={styles.note}>
        {t('importGoodreads.note')}
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

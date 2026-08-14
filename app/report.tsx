import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as reports from '../lib/reports';
import { alert } from '../lib/alert';
import Screen from '../components/Screen';
import Button from '../components/Button';

// Stable keys (not translated display text) sent as the `reason` value to
// reports.submitReport/stored server-side — app/admin.tsx looks them up via
// t(`report.reasons.${reason}`) to display in the admin's own UI language,
// regardless of which language the reporter used.
const BOOK_REASONS = ['bookIncorrectInfo', 'bookInappropriate', 'bookDuplicate', 'bookOther'];
const USER_REASONS = ['userAbusive', 'userFakeAccount', 'userSpam', 'userOther'];
// Shared by shared-reading messages and book reviews — both are free-text
// user content with the same realistic set of things worth flagging
// (a review can contain a spoiler just as easily as a message can).
const CONTENT_REASONS = ['contentSpoiler', 'contentInappropriate', 'contentHarassment', 'contentSpam', 'contentOther'];

// Generic report form for a book, a user, a shared-reading message, or a
// book review — reached from the "..." menu on app/book/[id].tsx and
// app/friends/[id].tsx, which pass targetType/targetId/label as params.
export default function ReportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const { targetType, targetId, label } = useLocalSearchParams<{ targetType: 'book' | 'user' | 'shared_reading_message' | 'book_review'; targetId: string; label?: string }>();
  const reasons =
    targetType === 'user' ? USER_REASONS
    : targetType === 'shared_reading_message' || targetType === 'book_review' ? CONTENT_REASONS
    : BOOK_REASONS;
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const submit = () => {
    if (!targetType || !targetId) return;
    setSending(true);
    reports.submitReport(targetType, targetId, reason, details).then(() => {
      setSending(false);
      alert(t('report.thanksTitle'), t('report.thanksMessage'), [{ text: t('common.ok'), onPress: () => router.back() }]);
    }).catch(() => { setSending(false); alert(t('common.error'), t('report.sendError')); });
  };

  const title =
    targetType === 'user' ? t('report.titleUser')
    : targetType === 'shared_reading_message' ? t('report.titleMessage')
    : targetType === 'book_review' ? t('report.titleReview')
    : t('report.titleBook');

  return (
    <Screen back title={title} atmosphere="pink">
      {label ? <Text style={styles.target}>{label}</Text> : null}

      <Text style={styles.label}>{t('report.reasonLabel')}</Text>
      {reasons.map((r) => (
        <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => setReason(r)}>
          <View style={[styles.radio, reason === r && styles.radioActive]}>
            {reason === r && <View style={styles.radioDot} />}
          </View>
          <Text style={styles.reasonText}>{t(`report.reasons.${r}`)}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>{t('report.detailsLabel')}</Text>
      <TextInput
        style={styles.input}
        value={details}
        onChangeText={setDetails}
        placeholder={t('report.detailsPlaceholder')}
        placeholderTextColor={colors.gray}
        multiline
        maxLength={500}
      />

      <Button label={sending ? t('report.sending') : t('report.send')} variant="danger" onPress={submit} disabled={sending} style={{ marginTop: 20 }} />
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

import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { submitSuggestion } from '../lib/suggestions';
import Screen from '../components/Screen';
import Button from '../components/Button';
import BookForm, { BookFormFields, EMPTY_BOOK_FORM } from '../components/BookForm';

export default function SuggestBookScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const [book, setBook] = useState<BookFormFields>(EMPTY_BOOK_FORM);
  const [loading, setLoading] = useState(false);

  const submit = () => {
    if (!book.title.trim() || !book.author.trim()) { Alert.alert(t('common.error'), t('suggestBook.errors.titleAndAuthorRequired')); return; }
    setLoading(true);
    submitSuggestion(book).then(() => {
      setLoading(false);
      Alert.alert(t('suggestBook.sent'), t('suggestBook.sentMessage'), [{ text: t('common.ok'), onPress: () => router.back() }]);
    }).catch(() => { setLoading(false); Alert.alert(t('common.error'), t('suggestBook.errors.sendFailed')); });
  };

  return (
    <Screen back title={t('suggestBook.title')}>
      <View style={styles.hero}>
        <Feather name="send" size={28} color={colors.purple} />
        <Text style={styles.heroTitle}>{t('suggestBook.heroTitle')}</Text>
        <Text style={styles.heroSub}>{t('suggestBook.heroSub')}</Text>
      </View>

      <BookForm value={book} onChange={setBook} requireAuthor />

      <Button label={loading ? t('suggestBook.sending') : t('suggestBook.send')} onPress={submit} disabled={loading} style={{ marginTop: 12 }} />
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  heroTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 20 },
});

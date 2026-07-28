import { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import * as admin from '../lib/admin';
import BookForm, { BookFormFields, EMPTY_BOOK_FORM } from '../components/BookForm';
import Screen from '../components/Screen';
import Button from '../components/Button';

// Admin-only direct edit of an existing catalog book — reached from the
// "..." menu on app/book/[id].tsx (gated there on profile.role === 'admin').
// Unlike app/edit-book-suggestion.tsx, this writes straight to `books` with
// no suggestion/approval step, and title/author/cover are all editable.
export default function AdminEditBookScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const [book, setBook] = useState<BookFormFields>(EMPTY_BOOK_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bookId) return;
    admin.getBookById(bookId).then((b) => { setBook(b); setLoading(false); }).catch(() => setLoading(false));
  }, [bookId]);

  const save = () => {
    if (!bookId || !book.title.trim()) return;
    setSaving(true);
    admin.updateBookDirect(bookId, book).then(() => {
      setSaving(false);
      router.back();
    }).catch(() => setSaving(false));
  };

  return (
    <Screen back title={t('admin.editBookTitle')} atmosphere="teal">
      {loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : (
        <>
          <BookForm value={book} onChange={setBook} requireAuthor />
          <Button label={saving ? t('admin.saving') : t('admin.saveChanges')} onPress={save} disabled={saving} style={{ marginTop: 12 }} />
        </>
      )}
    </Screen>
  );
}

import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { submitSuggestion } from '../lib/suggestions';

export default function SuggestBookScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = () => {
    if (!title.trim()) { Alert.alert('Erreur', 'Le titre est requis'); return; }
    setLoading(true);
    submitSuggestion(title, author, message).then(() => {
      setLoading(false);
      Alert.alert('🎉', 'Suggestion envoyée ! L\'admin la reviewera bientôt.', [{ text: 'OK', onPress: () => router.back() }]);
    }).catch(() => { setLoading(false); Alert.alert('Erreur', 'Impossible d\'envoyer la suggestion'); });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backBtn}>← Retour</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Suggérer un livre</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>💡</Text>
          <Text style={styles.heroTitle}>Tu connais un livre incroyable ?</Text>
          <Text style={styles.heroSub}>Propose-le à l'admin pour qu'il soit ajouté à Readigma !</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>Titre du livre *</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: The Name of the Wind" placeholderTextColor={colors.gray} />
          <Text style={styles.label}>Auteur</Text>
          <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Ex: Patrick Rothfuss" placeholderTextColor={colors.gray} />
          <Text style={styles.label}>Pourquoi ce livre ?</Text>
          <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage}
            placeholder="Dis-nous pourquoi ce livre mérite d'être sur Readigma..." placeholderTextColor={colors.gray} multiline maxLength={300} />
          <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={loading}>
            <Text style={styles.submitBtnText}>{loading ? 'Envoi...' : '💡 Envoyer la suggestion'}</Text>
          </TouchableOpacity>
        </View>
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
  hero: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  heroEmoji: { fontSize: 56 },
  heroTitle: { fontSize: 18, fontWeight: '700', color: colors.white, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 20 },
  form: { gap: 4 },
  label: { fontSize: 12, color: colors.gray, marginBottom: 6, fontWeight: '500' },
  input: { backgroundColor: colors.card, borderRadius: radius.sm, padding: 14, color: colors.white, fontSize: 15, borderWidth: 1, borderColor: colors.divider, marginBottom: 16 },
  submitBtn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: 16, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
});

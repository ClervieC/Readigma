import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { submitSuggestion } from '../lib/suggestions';
import Screen from '../components/Screen';
import Button from '../components/Button';

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
      Alert.alert('Envoyé', 'Suggestion envoyée ! L\'admin la reviewera bientôt.', [{ text: 'OK', onPress: () => router.back() }]);
    }).catch(() => { setLoading(false); Alert.alert('Erreur', 'Impossible d\'envoyer la suggestion'); });
  };

  return (
    <Screen back title="Suggérer un livre">
      <View style={styles.hero}>
        <Feather name="send" size={28} color={colors.purple} />
        <Text style={styles.heroTitle}>Tu connais un livre incroyable ?</Text>
        <Text style={styles.heroSub}>Propose-le à l'admin pour qu'il soit ajouté à Readigma.</Text>
      </View>

      <Text style={styles.label}>Titre du livre *</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: The Name of the Wind" placeholderTextColor={colors.gray} />

      <Text style={styles.label}>Auteur</Text>
      <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Ex: Patrick Rothfuss" placeholderTextColor={colors.gray} />

      <Text style={styles.label}>Pourquoi ce livre ?</Text>
      <TextInput style={[styles.input, styles.textarea]} value={message} onChangeText={setMessage}
        placeholder="Dis-nous pourquoi ce livre mérite d'être sur Readigma..." placeholderTextColor={colors.gray} multiline maxLength={300} />

      <Button label={loading ? 'Envoi...' : 'Envoyer la suggestion'} onPress={submit} disabled={loading} style={{ marginTop: 12 }} />
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  heroTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 20 },
  label: { fontSize: 11, color: colors.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: 10, color: colors.white, fontSize: 15, marginBottom: 22 },
  textarea: { height: 90, textAlignVertical: 'top' },
});

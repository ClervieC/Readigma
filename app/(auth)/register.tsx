import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { Link } from 'expo-router';
import { fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const styles = makeStyles(colors);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!username || !email || !password) { Alert.alert('Erreur', 'Tous les champs sont requis'); return; }
    setLoading(true);
    try {
      await signUp(email, password, username);
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Erreur inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Text style={styles.logo}>Readigma</Text>
          <Text style={styles.tagline}>Stop searching. Start discovering.</Text>
        </View>

        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Rejoins la communauté de lecteurs</Text>

        <Text style={styles.label}>Nom d'utilisateur</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername}
          placeholder="ton_pseudo" placeholderTextColor={colors.gray} autoCapitalize="none" />

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail}
          placeholder="ton@email.com" placeholderTextColor={colors.gray}
          keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          placeholder="••••••••" placeholderTextColor={colors.gray} secureTextEntry />

        <Button label="Créer mon compte" onPress={register} loading={loading} style={{ marginTop: 24 }} />

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity>
            <Text style={styles.switchText}>
              Déjà un compte ? <Text style={styles.switchLink}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  top: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 22, fontFamily: fonts.headingBold, color: colors.purple, letterSpacing: 1 },
  tagline: { fontSize: 12, color: colors.gray, marginTop: 6 },
  title: { fontSize: 24, fontFamily: fonts.headingBold, color: colors.white, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.gray, marginBottom: 28 },
  label: { fontSize: 11, color: colors.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 15,
    marginBottom: 22,
  },
  switchText: { textAlign: 'center', fontSize: 13, color: colors.gray, marginTop: 20 },
  switchLink: { color: colors.lavender, fontWeight: '600' },
});

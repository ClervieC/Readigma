import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../contexts/theme.context';
import { authService } from '../services/auth.service';

export default function RegisterScreen({ navigation, onLogin }: any) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!username || !email || !password) { Alert.alert('Erreur', 'Tous les champs sont requis'); return; }
    setLoading(true);
    try {
      await authService.register(username, email, password);
      onLogin();
    } catch (err: any) {
      Alert.alert('Erreur', err.response?.data?.error || 'Erreur inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Text style={styles.logo}>📖 READIGMA</Text>
          <Text style={styles.tagline}>Stop searching. Start discovering.</Text>
        </View>

        <View style={styles.card}>
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

          <TouchableOpacity style={styles.btn} onPress={register} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Création...' : 'Créer mon compte'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.switchText}>
              Déjà un compte ? <Text style={styles.switchLink}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  top: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 28, fontWeight: '700', color: colors.purple, letterSpacing: 1 },
  tagline: { fontSize: 13, color: colors.gray, marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 24, borderWidth: 1, borderColor: colors.divider },
  title: { fontSize: 22, fontWeight: '700', color: colors.white, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.gray, marginBottom: 24 },
  label: { fontSize: 12, color: colors.gray, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: colors.card2, borderRadius: radius.sm, padding: 14,
    color: colors.white, fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: colors.divider,
  },
  btn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  btnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  switchText: { textAlign: 'center', fontSize: 13, color: colors.gray },
  switchLink: { color: colors.lavender, fontWeight: '500' },
});

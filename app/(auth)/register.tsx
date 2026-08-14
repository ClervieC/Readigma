import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { alert } from '../../lib/alert';
import Button from '../../components/Button';
import AtmosphericBackground from '../../components/AtmosphericBackground';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!username || !email || !password) { alert(t('common.error'), t('auth.register.errors.fieldsRequired')); return; }
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp(email, password, username);
      if (needsEmailConfirmation) {
        router.push({ pathname: '/(auth)/confirm-email', params: { email } });
      }
    } catch (err: any) {
      alert(t('common.error'), err.message || t('auth.register.errors.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AtmosphericBackground tint="purple" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Text style={styles.logo}>Readigma</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
        </View>

        <Text style={styles.title}>{t('auth.register.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.register.subtitle')}</Text>

        <Text style={styles.label}>{t('auth.register.username')}</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername}
          placeholder={t('auth.register.usernamePlaceholder')} placeholderTextColor={colors.gray} autoCapitalize="none" />

        <Text style={styles.label}>{t('auth.register.email')}</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail}
          placeholder={t('auth.register.emailPlaceholder')} placeholderTextColor={colors.gray}
          keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>{t('auth.register.password')}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.gray}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={10}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.gray} />
          </TouchableOpacity>
        </View>

        <Button label={t('auth.register.submit')} onPress={register} loading={loading} style={{ marginTop: 24 }} />

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity>
            <Text style={styles.switchText}>
              {t('auth.register.hasAccount')} <Text style={styles.switchLink}>{t('auth.register.loginLink')}</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // maxWidth keeps the form (and its inputs) from stretching edge-to-edge
  // on wide/web viewports — width + alignSelf center it within that cap
  // instead of just clamping the left edge.
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28, maxWidth: 400, width: '100%', alignSelf: 'center' },
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: 22,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 15,
  },
  switchText: { textAlign: 'center', fontSize: 13, color: colors.gray, marginTop: 20 },
  switchLink: { color: colors.lavender, fontWeight: '600' },
});

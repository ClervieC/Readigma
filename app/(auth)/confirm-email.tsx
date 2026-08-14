import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { alert } from '../../lib/alert';
import Button from '../../components/Button';
import AtmosphericBackground from '../../components/AtmosphericBackground';

export default function ConfirmEmailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const [resending, setResending] = useState(false);

  // Best-effort auto-detection: if the confirmation link is opened in
  // another tab of this same browser, Supabase's client syncs the resulting
  // session back here via a storage event, which flips `session` truthy —
  // that's as close as we can get to "knowing" it was confirmed (there's no
  // signal at all for the common case of confirming from a different
  // device). Per the requested flow this shouldn't silently auto-log the
  // user in here, so it signs them back out and sends them to a real first
  // login instead.
  useEffect(() => {
    if (!session) return;
    signOut().then(() => router.replace('/(auth)/login'));
  }, [session]);

  const resend = () => {
    if (!params.email) return;
    setResending(true);
    supabase.auth.resend({ type: 'signup', email: params.email }).then(({ error }) => {
      setResending(false);
      if (error) alert(t('common.error'), error.message);
      else alert(t('auth.confirmEmail.resentTitle'), t('auth.confirmEmail.resentMessage'));
    });
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground tint="purple" />
      <View style={styles.card}>
        <Feather name="mail" size={32} color={colors.purple} />
        <Text style={styles.title}>{t('auth.confirmEmail.title')}</Text>
        <Text style={styles.subtitle}>
          {params.email
            ? t('auth.confirmEmail.subtitleWithEmail', { email: params.email })
            : t('auth.confirmEmail.subtitleNoEmail')}
        </Text>
        <Text style={styles.note}>{t('auth.confirmEmail.note')}</Text>

        <Button label={t('auth.confirmEmail.confirmed')} onPress={() => router.replace('/(auth)/login')} style={{ marginTop: 28, alignSelf: 'stretch' }} />
        <Text style={styles.resend} onPress={resending ? undefined : resend}>
          {resending ? t('auth.confirmEmail.resending') : t('auth.confirmEmail.resend')}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { alignItems: 'center', maxWidth: 340 },
  title: { fontSize: 22, fontFamily: fonts.headingBold, color: colors.white, marginTop: 20, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.gray, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  note: { fontSize: 12, color: colors.gray, textAlign: 'center', marginTop: 14, lineHeight: 18, opacity: 0.8 },
  resend: { fontSize: 13, color: colors.lavender, fontWeight: '600', marginTop: 18 },
});

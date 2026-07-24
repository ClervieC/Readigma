import { View, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../theme';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAdConsent } from '../context/AdConsentContext';
import { setAppLanguage, AppLanguage } from '../lib/i18n';
import Screen from '../components/Screen';
import Row from '../components/Row';
import Pill from '../components/Pill';

const THEME_OPTIONS: { labelKey: string; value: ThemeMode }[] = [
  { labelKey: 'settings.light', value: 'light' },
  { labelKey: 'settings.dark', value: 'dark' },
  { labelKey: 'settings.system', value: 'system' },
];

const LANGUAGE_OPTIONS: { labelKey: string; value: AppLanguage }[] = [
  { labelKey: 'settings.french', value: 'fr' },
  { labelKey: 'settings.english', value: 'en' },
];

const SETTINGS: { icon: keyof typeof Feather.glyphMap; labelKey: string; route: string }[] = [
  { icon: 'edit-2', labelKey: 'settings.editProfile', route: '/edit-profile' },
  { icon: 'upload', labelKey: 'settings.importGoodreads', route: '/import-goodreads' },
  { icon: 'help-circle', labelKey: 'settings.help', route: '/help' },
  { icon: 'shield', labelKey: 'settings.privacy', route: '/privacy' },
  { icon: 'file-text', labelKey: 'settings.terms', route: '/terms' },
];

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { colors, isDark, mode, setMode } = useTheme();
  const { consent, setConsent } = useAdConsent();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t, i18n } = useTranslation();

  return (
    <Screen back title={t('settings.title')}>
      <View>
        {SETTINGS.map(item => (
          <Row key={item.route} onPress={() => router.push(item.route as any)} chevron
            icon={<Feather name={item.icon} size={18} color={colors.white} />}>
            <Text style={styles.settingLabel}>{t(item.labelKey)}</Text>
          </Row>
        ))}

        <View style={styles.themeRow}>
          <View style={styles.themeLabelRow}>
            <Feather name={isDark ? 'moon' : 'sun'} size={18} color={colors.white} />
            <Text style={styles.settingLabel}>{t('settings.appearance')}</Text>
          </View>
          <View style={styles.themeOptions}>
            {THEME_OPTIONS.map(opt => (
              <Pill key={opt.value} label={t(opt.labelKey)} active={mode === opt.value} onPress={() => setMode(opt.value)} />
            ))}
          </View>
        </View>

        <View style={styles.themeRow}>
          <View style={styles.themeLabelRow}>
            <Feather name="globe" size={18} color={colors.white} />
            <Text style={styles.settingLabel}>{t('settings.language')}</Text>
          </View>
          <View style={styles.themeOptions}>
            {LANGUAGE_OPTIONS.map(opt => (
              <Pill key={opt.value} label={t(opt.labelKey)} active={i18n.language === opt.value} onPress={() => setAppLanguage(opt.value)} />
            ))}
          </View>
        </View>

        {Platform.OS === 'web' && (
          <View style={styles.themeRow}>
            <View style={styles.themeLabelRow}>
              <Feather name="target" size={18} color={colors.white} />
              <Text style={styles.settingLabel}>{t('settings.ads')}</Text>
            </View>
            <View style={styles.themeOptions}>
              <Pill label={t('ads.consentAccept')} active={consent === 'granted'} onPress={() => setConsent('granted')} />
              <Pill label={t('ads.consentDecline')} active={consent === 'denied'} onPress={() => setConsent('denied')} />
            </View>
          </View>
        )}

        <Row last onPress={signOut} icon={<Feather name="log-out" size={18} color={colors.error} />}>
          <Text style={[styles.settingLabel, { color: colors.error }]}>{t('settings.logout')}</Text>
        </Row>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  settingLabel: { fontSize: 14, color: colors.white },
  themeRow: { paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  themeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  themeOptions: { flexDirection: 'row', gap: 8 },
});

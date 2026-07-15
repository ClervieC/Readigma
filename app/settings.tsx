import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import Row from '../components/Row';
import Pill from '../components/Pill';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' },
  { label: 'Système', value: 'system' },
];

const SETTINGS: { icon: keyof typeof Feather.glyphMap; label: string; route: string }[] = [
  { icon: 'edit-2', label: 'Modifier le profil', route: '/edit-profile' },
  { icon: 'upload', label: 'Importer depuis Goodreads', route: '/import-goodreads' },
  { icon: 'help-circle', label: 'Aide & Contact', route: '/help' },
  { icon: 'shield', label: 'Confidentialité', route: '/privacy' },
  { icon: 'file-text', label: "Conditions d'utilisation", route: '/terms' },
];

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { colors, isDark, mode, setMode } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);

  return (
    <Screen back title="Paramètres">
      <View>
        {SETTINGS.map(item => (
          <Row key={item.route} onPress={() => router.push(item.route as any)} chevron
            icon={<Feather name={item.icon} size={18} color={colors.white} />}>
            <Text style={styles.settingLabel}>{item.label}</Text>
          </Row>
        ))}

        <View style={styles.themeRow}>
          <View style={styles.themeLabelRow}>
            <Feather name={isDark ? 'moon' : 'sun'} size={18} color={colors.white} />
            <Text style={styles.settingLabel}>Apparence</Text>
          </View>
          <View style={styles.themeOptions}>
            {THEME_OPTIONS.map(opt => (
              <Pill key={opt.value} label={opt.label} active={mode === opt.value} onPress={() => setMode(opt.value)} />
            ))}
          </View>
        </View>

        <Row last onPress={signOut} icon={<Feather name="log-out" size={18} color={colors.error} />}>
          <Text style={[styles.settingLabel, { color: colors.error }]}>Se déconnecter</Text>
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

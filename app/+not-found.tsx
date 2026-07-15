import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Button from '../components/Button';

// Expo Router's special filename for any route that doesn't match — replaces
// its generic black "Unmatched Route" screen with one that fits the app and
// gives a real way back in. Goes to "/" rather than straight to login: the
// root already redirects to tabs for a still-valid session (see
// app/_layout.tsx's RootNavigation) or to login otherwise, so this never
// force-logs-out someone who hit a stale/bad link while signed in.
export default function NotFoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Feather name="compass" size={40} color={colors.purple} />
      <Text style={styles.title}>Page introuvable</Text>
      <Text style={styles.subtitle}>Cette page n'existe pas ou plus.</Text>
      <Button label="Retour à l'accueil" onPress={() => router.replace('/')} style={{ marginTop: 28 }} />
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { fontSize: 22, fontFamily: fonts.headingBold, color: colors.white, marginTop: 18 },
  subtitle: { fontSize: 14, color: colors.gray, marginTop: 8, textAlign: 'center' },
});

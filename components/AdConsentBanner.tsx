import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fonts, shadows, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAdConsent } from '../context/AdConsentContext';

// GDPR/ePrivacy require asking *before* any ad cookie is set, not offering
// an opt-out afterwards — so this only ever offers "accept" or "decline",
// never renders anything until the user picks one (consent === 'unknown'),
// and AdBanner/ensureAdSenseScript never run before that choice is 'granted'.
// Re-openable later from Settings → Publicité if the user changes their mind.
export default function AdConsentBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { consent, setConsent } = useAdConsent();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  if (Platform.OS !== 'web' || consent !== 'unknown') return null;

  return (
    // Sits above the tab bar (TimerBubble.tsx's own 92px approximation,
    // plus a small buffer) rather than at bottom: 0 — otherwise this
    // absolutely-positioned banner stacks on top of it and blocks every tab
    // from being tapped until the user answers the prompt. The exact 92px
    // figure landed flush against the tab bar with zero gap, which was
    // still enough for hit-testing to occasionally resolve to this banner
    // instead of the tab underneath it.
    <View style={[styles.banner, { bottom: 92 + 12 + insets.bottom }]}>
      <Text style={styles.text}>{t('ads.consentText')}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={6}>
          <Text style={styles.link}>{t('ads.consentLearnMore')}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.declineBtn} onPress={() => setConsent('denied')}>
          <Text style={styles.declineText}>{t('ads.consentDecline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => setConsent('granted')}>
          <Text style={styles.acceptText}>{t('ads.consentAccept')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    banner: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      padding: 16,
      gap: 12,
      zIndex: 1000,
      ...shadows.card,
    },
    text: { fontSize: 13, color: colors.muted, lineHeight: 19 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    link: { fontSize: 13, color: colors.purple, fontFamily: fonts.headingBold, textDecorationLine: 'underline' },
    declineBtn: { paddingVertical: 8, paddingHorizontal: 14 },
    declineText: { fontSize: 13, color: colors.muted, fontFamily: fonts.headingBold },
    acceptBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.purple },
    acceptText: { fontSize: 13, color: colors.white, fontFamily: fonts.headingBold },
  });

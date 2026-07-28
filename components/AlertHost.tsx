import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import i18n from '../lib/i18n';
import { subscribeAlert, dismissAlert, AlertState, AlertButton } from '../lib/alertStore';
import { fonts, radius, shadows, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';

// A handful of call sites (goal.tsx, book/[id].tsx...) pass a single emoji as
// the "title" — a leftover convention from when the native Alert.alert title
// was the only place to put something celebratory. Rendered as a big emoji
// instead of a small icon + heading, which is why those still read fine.
const EMOJI_TITLE_RE = /^[\u{1F000}-\u{1FFFF}☀-➿⬀-⯿️]+$/u;

// Every "error" alert in the app passes the exact same translated string as
// its title (t('common.error')) — comparing against that (rather than
// tagging each call site with an explicit severity) is what lets every
// existing alert() call get a fitting tone with zero call-site changes.
function pickTone(state: AlertState, colors: ColorPalette): { icon: keyof typeof Feather.glyphMap; tint: string } {
  if (state.buttons.some((b) => b.style === 'destructive')) return { icon: 'alert-triangle', tint: colors.error };
  if (state.title === i18n.t('common.error')) return { icon: 'x-circle', tint: colors.error };
  if (state.buttons.length > 1) return { icon: 'help-circle', tint: colors.lavender };
  return { icon: 'check-circle', tint: colors.purple };
}

export default function AlertHost() {
  const { colors } = useTheme();
  const [state, setState] = useState<AlertState | null>(null);
  const styles = makeStyles(colors);

  useEffect(() => subscribeAlert(setState), []);

  if (!state) return null;

  const isEmojiTitle = EMOJI_TITLE_RE.test(state.title.trim());
  const tone = pickTone(state, colors);

  const press = (b: AlertButton) => {
    dismissAlert();
    b.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <Animated.View entering={ZoomIn.duration(180)} style={styles.card}>
          {isEmojiTitle ? (
            <Text style={styles.bigEmoji}>{state.title}</Text>
          ) : (
            <>
              <View style={[styles.iconWrap, { backgroundColor: tone.tint + '26' }]}>
                <Feather name={tone.icon} size={22} color={tone.tint} />
              </View>
              <Text style={styles.title}>{state.title}</Text>
            </>
          )}
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}

          <View style={[styles.buttonsRow, state.buttons.length > 2 && styles.buttonsCol]}>
            {state.buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.button,
                  b.style === 'destructive' && styles.buttonDestructive,
                  b.style === 'cancel' && styles.buttonCancel,
                ]}
                onPress={() => press(b)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'cancel' && styles.buttonTextCancel,
                  ]}
                >
                  {b.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.divider,
      padding: 24,
      alignItems: 'center',
      ...shadows.glow,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    bigEmoji: { fontSize: 40, marginBottom: 10 },
    title: {
      fontSize: 17,
      fontFamily: fonts.headingBold,
      color: colors.white,
      textAlign: 'center',
      marginBottom: 6,
    },
    message: {
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.gray,
      textAlign: 'center',
      lineHeight: 20,
    },
    buttonsRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 20 },
    buttonsCol: { flexDirection: 'column' },
    button: {
      flex: 1,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.purple,
    },
    buttonCancel: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.divider,
    },
    buttonDestructive: { backgroundColor: colors.error },
    buttonText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: 'white' },
    buttonTextCancel: { color: colors.white },
  });

import { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { alert } from '../lib/alert';
import ShareBookCard, { ShareBookCardData } from './ShareBookCard';

// Native: captureRef writes a real tmp file, shared via the OS share sheet
// (Sharing.shareAsync) — Instagram Stories shows up there as a target if
// the app is installed, same as any other photo-sharing flow. Web: view-shot
// falls back to a canvas data-URI (see RNViewShot.web.ts) with no share
// sheet to hand it to, so it's downloaded instead — the closest equivalent
// a browser can do without Instagram's own API.
export default function ShareBookModal({
  visible,
  onClose,
  data,
}: {
  visible: boolean;
  onClose: () => void;
  data: ShareBookCardData;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        const dataUri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'data-uri' });
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = 'readigma.png';
        link.click();
        alert(t('book.share.downloadedTitle'), t('book.share.downloadedMessage'));
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          alert(t('common.error'), t('book.share.unavailable'));
          return;
        }
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('book.share.shareSheetTitle') });
      }
    } catch {
      alert(t('common.error'), t('book.share.error'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <ShareBookCard ref={cardRef} colors={colors} data={data} />
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Feather name="x" size={20} color={colors.gray} />
            </TouchableOpacity>
            <TouchableOpacity onPress={share} disabled={sharing} style={styles.shareBtn}>
              {sharing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="share" size={16} color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>{t('book.share.button')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    sheet: { alignItems: 'center', gap: 18 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    closeBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
    },
    shareBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.purple, borderRadius: radius.md,
      paddingHorizontal: 20, paddingVertical: 13,
    },
    shareBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: '#FFFFFF' },
  });

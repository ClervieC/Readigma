import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, ScrollView } from 'react-native';
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
// falls back to a canvas data-URI (see RNViewShot.web.ts); the Web Share
// API (navigator.share with a File) opens the same kind of OS-level "where
// do you want to share this" sheet on browsers that support it (mobile
// Safari/Chrome, and recent desktop Chrome/Edge) — a plain forced download
// only kicks in as a last-resort fallback where that API isn't available.
async function dataUriToFile(dataUri: string, filename: string): Promise<File> {
  const res = await fetch(dataUri);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

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

  // iOS Safari only lets navigator.share() run inside a fresh user gesture
  // — the html2canvas capture + dataUri->File conversion took long enough
  // that the tap's activation had expired by the time share() was called,
  // so it rejected with NotAllowedError and surfaced as the generic error.
  // Web now snapshots the card as soon as the modal is open and the cover
  // has painted, so tapping Share can hand the ready File straight over.
  const preparedFile = useRef<File | null>(null);
  const [coverSettled, setCoverSettled] = useState(false);
  const onCoverSettled = useCallback(() => setCoverSettled(true), []);
  // The parent passes a fresh data object every render — compare by value
  // so the cached snapshot survives unrelated re-renders.
  const dataKey = JSON.stringify(data);

  useEffect(() => {
    preparedFile.current = null;
    if (!visible) setCoverSettled(false);
  }, [visible, dataKey]);

  const captureWebFile = useCallback(async () => {
    const dataUri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'data-uri' });
    const file = await dataUriToFile(dataUri, 'readigma.png');
    preparedFile.current = file;
    return file;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || !coverSettled) return;
    // Small delay so fonts/emoji have laid out before the snapshot.
    const timer = setTimeout(() => {
      captureWebFile().catch((err) => console.warn('[share] pre-capture failed', err));
    }, 300);
    return () => clearTimeout(timer);
  }, [visible, coverSettled, dataKey, captureWebFile]);

  const shareWeb = async () => {
    const cached = preparedFile.current;
    const file = cached ?? (await captureWebFile());
    const nav = navigator as any;
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: t('book.share.shareSheetTitle') });
      } catch (shareErr: any) {
        // AbortError just means the user closed the share sheet without
        // picking anything — not a real failure, nothing to report.
        if (shareErr?.name === 'AbortError') return;
        // The on-demand capture outlived the tap's user activation; the
        // file is cached now, so a second tap shares instantly.
        if (shareErr?.name === 'NotAllowedError' && !cached) {
          alert(t('book.share.readyTitle'), t('book.share.readyMessage'));
          return;
        }
        throw shareErr;
      }
    } else {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'readigma.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      alert(t('book.share.downloadedTitle'), t('book.share.downloadedMessage'));
    }
  };

  const share = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        await shareWeb();
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          alert(t('common.error'), t('book.share.unavailable'));
          return;
        }
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('book.share.shareSheetTitle') });
      }
    } catch (err) {
      console.warn('[share] failed', err);
      alert(t('common.error'), t('book.share.error'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      {/* Same nested-TouchableOpacity "tap outside closes, tap content
          doesn't" pattern used by every other modal in this app (finish
          modal, shared-reading menus, etc.) — the inner one claims the touch
          so it never reaches the outer's onPress. */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* The card's height depends on its content (a long review, many
            reactions — see ShareBookCard's minHeight-not-height) and can
            exceed a small phone's viewport. A plain centered View clipped
            the action row (close/share) off the bottom with no way to reach
            it in that case — this has to scroll instead of just center. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
            <ShareBookCard ref={cardRef} colors={colors} data={data} onCoverSettled={onCoverSettled} />
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
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
          </TouchableOpacity>
        </ScrollView>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingVertical: 40 },
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

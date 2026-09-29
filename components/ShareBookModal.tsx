import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { alert } from '../lib/alert';
import { API_BASE } from '../lib/apiUrl';
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

const CAPTURE_TIMEOUT_MS = 15000;

// The iPhone home-screen web app has no visible console — appending the
// real cause to the generic message is the only way to tell a failed
// capture from a rejected share when it happens on a phone.
function errorDetail(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  const detail = [e?.name, e?.message].filter(Boolean).join(': ');
  return detail ? `\n\n(${detail})` : '';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Inlines the (proxied) cover as a data URI so the html2canvas capture never
// waits on a network image — a slow/failed cover fetch used to leave the
// capture hanging forever. Returns null on any failure (placeholder is used).
async function coverToDataUri(coverUrl: string): Promise<string | null> {
  try {
    const res = await withTimeout(fetch(`${API_BASE}/api/image-proxy?url=${encodeURIComponent(coverUrl)}`), 8000);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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
  // Web only: the image is rendered as soon as the modal opens so the share
  // tap can call navigator.share synchronously — browsers reject share()
  // once the tap's user activation has expired during a slow capture.
  const [webCover, setWebCover] = useState<string | null | undefined>(undefined);
  const [webImage, setWebImage] = useState<{ file: File; dataUri: string } | null>(null);
  const [webFailed, setWebFailed] = useState(false);
  const webError = useRef<unknown>(null);

  const isWeb = Platform.OS === 'web';
  const cardData: ShareBookCardData =
    isWeb && data.coverUrl ? { ...data, coverUrl: webCover ?? null } : data;

  useEffect(() => {
    if (!isWeb || !visible) return;
    let cancelled = false;
    setWebCover(undefined);
    setWebImage(null);
    setWebFailed(false);
    (async () => {
      const cover = data.coverUrl ? await coverToDataUri(data.coverUrl) : null;
      if (cancelled) return;
      setWebCover(cover);
      // Let the card re-render with the inlined cover before capturing.
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled || !cardRef.current) return;
      try {
        const dataUri = await withTimeout(
          captureRef(cardRef, { format: 'png', quality: 1, result: 'data-uri' }),
          CAPTURE_TIMEOUT_MS,
        );
        const file = await dataUriToFile(dataUri, 'readigma.png');
        if (!cancelled) setWebImage({ file, dataUri });
      } catch (err) {
        console.warn('[share] pre-capture failed', err);
        webError.current = err;
        if (!cancelled) setWebFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, isWeb, data.coverUrl, data.title, data.comment, data.rating]);

  const share = async () => {
    if (sharing) return;
    if (isWeb) {
      if (!webImage) {
        if (webFailed) alert(t('common.error'), t('book.share.error') + errorDetail(webError.current));
        return;
      }
      const { file, dataUri } = webImage;
      const nav = navigator as any;
      try {
        if (nav.share && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: t('book.share.shareSheetTitle') });
        } else {
          const link = document.createElement('a');
          link.href = dataUri;
          link.download = 'readigma.png';
          link.click();
          alert(t('book.share.downloadedTitle'), t('book.share.downloadedMessage'));
        }
      } catch (shareErr: any) {
        // AbortError = user closed the share sheet; not a failure.
        if (shareErr?.name === 'AbortError') return;
        console.warn('[share] failed', shareErr);
        alert(t('common.error'), t('book.share.error') + errorDetail(shareErr));
      }
      return;
    }
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        alert(t('common.error'), t('book.share.unavailable'));
        return;
      }
      const uri = await withTimeout(
        captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' }),
        CAPTURE_TIMEOUT_MS,
      );
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('book.share.shareSheetTitle') });
    } catch {
      alert(t('common.error'), t('book.share.error'));
    } finally {
      setSharing(false);
    }
  };

  const busy = sharing || (isWeb && !webImage && !webFailed);

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
            <ShareBookCard ref={cardRef} colors={colors} data={cardData} />
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
              <TouchableOpacity onPress={share} disabled={busy} style={styles.shareBtn}>
                {busy ? (
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

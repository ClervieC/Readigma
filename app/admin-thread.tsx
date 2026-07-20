import { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, FlatList, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as supportChat from '../lib/supportChat';

// Locale-aware date formatting (not a translation key — Intl handles the
// month/day ordering per locale), unlike every other user-facing string in
// this file which does go through t().
function timeLabel(dateStr: string, locale: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${time}`;
}

// The admin-side mirror of app/contact.tsx — same thread, viewed from the
// other end. Reached from admin.tsx's "Messages" tab, which now lists one
// row per conversation (see supportChat.getThreadSummaries) instead of one
// row per message, since a user can send more than one.
export default function AdminThreadScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId, username } = useLocalSearchParams<{ userId: string; username?: string }>();
  const styles = makeStyles(colors);
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<supportChat.ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(() => {
    if (!userId) return;
    supportChat.getThreadFor(userId).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  useFocusEffect(useCallback(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]));

  const send = () => {
    const body = text.trim();
    if (!body || sending || !userId) return;
    setSending(true);
    setText('');
    supportChat.sendAdminReply(userId, body).then(() => {
      setSending(false);
      load();
    }).catch(() => {
      setSending(false);
      setText(body);
      Alert.alert(t('common.error'), t('contact.errors.sendFailed'));
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>@{username ?? '?'}</Text>
          <Text style={styles.subtitle}>{t('admin.thread.subtitle')}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        {loading ? (
          <Text style={styles.emptyText}>{t('admin.loading')}</Text>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.sender === 'admin' && styles.bubbleRowMine]}>
                <View style={[styles.bubble, item.sender === 'admin' ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, item.sender === 'admin' && styles.bubbleTextMine]}>{item.body}</Text>
                </View>
                <Text style={[styles.bubbleTime, item.sender === 'admin' && styles.bubbleTimeMine]}>{timeLabel(item.created_at, i18n.language)}</Text>
              </View>
            )}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('admin.thread.replyPlaceholder')}
            placeholderTextColor={colors.gray}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending || !text.trim()} hitSlop={8}>
            <Feather name="send" size={17} color={text.trim() ? colors.purple : colors.gray} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white },
  subtitle: { fontSize: 11, color: colors.gray, marginTop: 1 },
  emptyText: { color: colors.gray, textAlign: 'center', paddingTop: 40 },
  list: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  bubbleRow: { alignItems: 'flex-start', maxWidth: '82%' },
  bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleTheirs: { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.white, lineHeight: 20 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: colors.gray, marginTop: 4, marginLeft: 4 },
  bubbleTimeMine: { marginLeft: 0, marginRight: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  input: { flex: 1, minHeight: 38, maxHeight: 100, backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, color: colors.white, fontSize: 14 },
  sendBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});

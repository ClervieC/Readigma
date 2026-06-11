import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, TextInput, Alert, Modal } from 'react-native';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../contexts/theme.context';
import { booksService } from '../services/books.service';

const EMOJIS = ['😱', '🥰', '😭', '🤯', '😍', '🦋', '😤', '🫶', '💀', '🔥', '😢', '🤩', '😮', '💔', '⭐'];

const STATUS_OPTIONS = [
  { label: '🔖 À lire', value: 'to_read' },
  { label: '📖 Commencer à lire', value: 'reading' },
  { label: '✅ J\'ai fini !', value: 'done' },
  { label: '❌ Abandonner (DNF)', value: 'dnf' },
];

function StarRating({ rating, onChange, colors }: { rating: number; onChange: (r: number) => void; colors: ColorPalette }) {
  const steps = [0.25, 0.5, 0.75, 1];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <View key={star} style={{ width: 36, height: 36, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
          {steps.map(step => (
            <TouchableOpacity key={step} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${step * 100}%` as any, zIndex: 1 }}
              onPress={() => onChange(star - 1 + step)} />
          ))}
          <Text style={{ fontSize: 28, zIndex: 0, color: rating >= star ? colors.purple : rating >= star - 0.5 ? colors.lavender : colors.gray }}>
            {rating >= star ? '★' : rating >= star - 0.5 ? '⯨' : '☆'}
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: 14, color: colors.gray, marginLeft: 8 }}>{rating > 0 ? rating.toFixed(2) : '—'}</Text>
    </View>
  );
}

export default function BookDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { book } = route.params;
  const [currentBook, setCurrentBook] = useState(book);
  const [currentPage, setCurrentPage] = useState(book.current_page?.toString() || '');
  const [totalPages, setTotalPages] = useState(book.total_pages?.toString() || '');
  const [progressPercent, setProgressPercent] = useState(book.progress_percent?.toString() || '');
  const [progress, setProgress] = useState(book.progress_percent || 0);
  const [reactions, setReactions] = useState<any[]>([]);
  const [showReactionModal, setShowReactionModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [reactionNote, setReactionNote] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rating, setRating] = useState(book.rating ? parseFloat(book.rating) : 0);
  const [comment, setComment] = useState(book.comment || '');
  const [loading, setLoading] = useState(false);
  const [progressMode, setProgressMode] = useState<'pages' | 'percent'>('pages');

  useEffect(() => { loadReactions(); }, []);

  const loadReactions = () => {
    booksService.getReactions(book.book_id).then(res => setReactions(res.data)).catch(() => {});
  };

  const updateProgress = () => {
    let percent = 0, pages = 0;
    const total = parseInt(totalPages) || 0;
    if (progressMode === 'pages') {
      pages = parseInt(currentPage) || 0;
      if (total > 0) percent = Math.round((pages / total) * 100 * 100) / 100;
    } else {
      percent = parseFloat(progressPercent) || 0;
      if (percent > 100) { Alert.alert('Erreur', 'Le pourcentage ne peut pas dépasser 100%'); return; }
    }
    setLoading(true);
    booksService.updateProgress(book.book_id, { current_page: pages || undefined, total_pages: total || undefined, progress_percent: percent })
      .then(res => { setProgress(res.data.progress_percent); setLoading(false); Alert.alert('✅', 'Progression mise à jour !'); })
      .catch(() => { setLoading(false); Alert.alert('Erreur', 'Impossible de mettre à jour'); });
  };

  const changeStatus = (status: string) => {
    if (status === 'done') { setShowFinishModal(true); return; }
    booksService.addBook(book.book_id, status).then(() => {
      Alert.alert('✅', status === 'reading' ? 'Bonne lecture ! 📖' : 'Statut mis à jour !');
      navigation.goBack();
    }).catch(() => Alert.alert('Erreur', 'Impossible de mettre à jour'));
  };

  const finishBook = () => {
    booksService.addBook(book.book_id, 'done')
      .then(() => booksService.updateBook(book.book_id, { status: 'done', rating: rating || undefined, comment: comment || undefined }))
      .then(() => { setShowFinishModal(false); Alert.alert('🎉', 'Félicitations ! Tu as terminé ce livre !'); navigation.goBack(); })
      .catch((err: any) => Alert.alert('Erreur', err.response?.data?.error || 'Impossible de sauvegarder'));
  };

  const addReaction = () => {
    if (!selectedEmoji) { Alert.alert('Erreur', 'Choisis un emoji !'); return; }
    booksService.addReaction(book.book_id, { emoji: selectedEmoji, note: reactionNote, progress_percent: progress, page_number: parseInt(currentPage) || undefined, is_public: isPublic })
      .then(() => { setShowReactionModal(false); setSelectedEmoji(''); setReactionNote(''); loadReactions(); })
      .catch(() => Alert.alert('Erreur', 'Impossible d\'ajouter'));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backBtn}>← Retour</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Détails</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.bookCard}>
          <View style={styles.bookCover}><Text style={{ fontSize: 40 }}>📚</Text></View>
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle}>{currentBook.title}</Text>
            <Text style={styles.bookAuthor}>{currentBook.author}</Text>
            {currentBook.genres?.[0] && <View style={styles.genreBadge}><Text style={styles.genreText}>{currentBook.genres[0]}</Text></View>}
            {currentBook.published_year && <Text style={styles.year}>📅 {currentBook.published_year}</Text>}
          </View>
        </View>

        {currentBook.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Résumé</Text>
            <Text style={styles.description} numberOfLines={6}>{currentBook.description}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📌 Statut</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map(s => (
              <TouchableOpacity key={s.value} style={[styles.statusBtn, currentBook.status === s.value && styles.statusBtnActive]} onPress={() => changeStatus(s.value)}>
                <Text style={[styles.statusText, currentBook.status === s.value && styles.statusTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {currentBook.status === 'reading' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📖 Ma progression</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` as any }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}% lu</Text>
            <View style={styles.modeToggle}>
              {(['pages', 'percent'] as const).map(mode => (
                <TouchableOpacity key={mode} style={[styles.modeBtn, progressMode === mode && styles.modeBtnActive]} onPress={() => setProgressMode(mode)}>
                  <Text style={[styles.modeBtnText, progressMode === mode && styles.modeBtnTextActive]}>{mode === 'pages' ? 'Par pages' : 'Par %'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {progressMode === 'pages' ? (
              <View style={styles.pagesRow}>
                <View style={styles.pageInput}>
                  <Text style={styles.inputLabel}>Page actuelle</Text>
                  <TextInput style={styles.input} value={currentPage} onChangeText={setCurrentPage} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.gray} />
                </View>
                <Text style={styles.slash}>/</Text>
                <View style={styles.pageInput}>
                  <Text style={styles.inputLabel}>Total pages</Text>
                  <TextInput style={styles.input} value={totalPages} onChangeText={setTotalPages} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.gray} />
                </View>
              </View>
            ) : (
              <View style={styles.percentRow}>
                <Text style={styles.inputLabel}>Pourcentage lu</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={progressPercent} onChangeText={setProgressPercent} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.gray} />
                  <Text style={styles.percentSign}>%</Text>
                </View>
              </View>
            )}
            <View style={styles.progressBtns}>
              <TouchableOpacity style={styles.updateBtn} onPress={updateProgress} disabled={loading}>
                <Text style={styles.updateBtnText}>{loading ? 'Mise à jour...' : '✅ Mettre à jour'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.finishBtn} onPress={() => setShowFinishModal(true)}>
                <Text style={styles.finishBtnText}>🎉 J'ai fini !</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {currentBook.status === 'done' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⭐ Ma note</Text>
            <StarRating rating={rating} onChange={setRating} colors={colors} />
            <TextInput style={[styles.input, { marginTop: 12, textAlign: 'left', height: 80 }]}
              value={comment} onChangeText={setComment} placeholder="Mon avis sur ce livre... (optionnel)"
              placeholderTextColor={colors.gray} multiline />
            <TouchableOpacity style={[styles.updateBtn, { marginTop: 12 }]}
              onPress={() => booksService.updateBook(book.book_id, { rating, comment }).then(() => Alert.alert('✅', 'Note sauvegardée !'))}>
              <Text style={styles.updateBtnText}>Sauvegarder</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💭 Mon voyage de lecture</Text>
            <TouchableOpacity style={styles.addReactionBtn} onPress={() => setShowReactionModal(true)}>
              <Text style={styles.addReactionText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>
          {reactions.length === 0 ? (
            <Text style={styles.emptyText}>Ajoute ta première réaction !</Text>
          ) : (
            <View style={styles.timeline}>
              {reactions.map((r, i) => (
                <View key={i} style={styles.timelineItem}>
                  <View style={styles.timelineLine}>
                    <View style={styles.timelineDot} />
                    {i < reactions.length - 1 && <View style={styles.timelineConnector} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={styles.timelineEmoji}>{r.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.timelinePercent}>{r.progress_percent ? `${Math.round(r.progress_percent)}%` : ''}{r.page_number ? ` · Page ${r.page_number}` : ''}</Text>
                        <Text style={{ fontSize: 10 }}>{r.is_public ? '🌍' : '🔒'}</Text>
                      </View>
                    </View>
                    {r.note && <Text style={styles.timelineNote}>{r.note}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>

      <Modal visible={showReactionModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReactionModal(false)}>
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Comment tu te sens ?</Text>
            <Text style={styles.modalSubtitle}>à {Math.round(progress)}% du livre</Text>
            <View style={styles.emojiGrid}>
              {EMOJIS.map(emoji => (
                <TouchableOpacity key={emoji} style={[styles.emojiBtn, selectedEmoji === emoji && styles.emojiBtnSelected]} onPress={() => setSelectedEmoji(emoji)}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.noteInput} value={reactionNote} onChangeText={setReactionNote} placeholder="Ajoute une note..." placeholderTextColor={colors.gray} multiline maxLength={200} />
            <TouchableOpacity style={styles.publicToggle} onPress={() => setIsPublic(!isPublic)}>
              <Text style={styles.publicToggleText}>{isPublic ? '🌍 Partager avec mes amis' : '🔒 Garder privé'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={addReaction}>
              <Text style={styles.submitBtnText}>Ajouter 🎉</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showFinishModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFinishModal(false)}>
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>🎉 Tu as terminé !</Text>
            <Text style={styles.modalSubtitle}>{currentBook.title}</Text>
            <Text style={styles.ratingLabel}>Ta note (optionnel)</Text>
            <StarRating rating={rating} onChange={setRating} colors={colors} />
            <TextInput style={[styles.noteInput, { marginTop: 16 }]} value={comment} onChangeText={setComment}
              placeholder="Ton avis sur ce livre... (optionnel)" placeholderTextColor={colors.gray} multiline maxLength={500} />
            <TouchableOpacity style={styles.submitBtn} onPress={finishBook}>
              <Text style={styles.submitBtnText}>Terminer la lecture 📚</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { fontSize: 14, color: colors.lavender, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 16 },
  bookCard: { flexDirection: 'row', gap: 14, backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginTop: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.divider, alignItems: 'center' },
  bookCover: { width: 70, height: 95, backgroundColor: colors.card2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 4 },
  bookAuthor: { fontSize: 12, color: colors.gray, marginBottom: 6 },
  genreBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,206,201,0.1)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  genreText: { fontSize: 10, color: colors.teal },
  year: { fontSize: 11, color: colors.gray },
  section: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginTop: 12, borderWidth: 1, borderColor: colors.divider },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 12 },
  description: { fontSize: 13, color: colors.gray, lineHeight: 20 },
  statusGrid: { gap: 8 },
  statusBtn: { padding: 12, backgroundColor: colors.card2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider },
  statusBtnActive: { borderColor: colors.purple, backgroundColor: 'rgba(108,92,231,0.15)' },
  statusText: { fontSize: 14, color: colors.gray, fontWeight: '500' },
  statusTextActive: { color: colors.lavender },
  progressBar: { height: 8, backgroundColor: colors.card2, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 4 },
  progressText: { fontSize: 12, color: colors.teal, marginBottom: 16, textAlign: 'right' },
  modeToggle: { flexDirection: 'row', backgroundColor: colors.card2, borderRadius: radius.sm, padding: 3, marginBottom: 14 },
  modeBtn: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.purple },
  modeBtnText: { fontSize: 12, color: colors.gray },
  modeBtnTextActive: { color: 'white', fontWeight: '600' },
  pagesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pageInput: { flex: 1 },
  inputLabel: { fontSize: 11, color: colors.gray, marginBottom: 4 },
  input: { backgroundColor: colors.card2, borderRadius: radius.sm, padding: 12, color: colors.white, fontSize: 16, borderWidth: 1, borderColor: colors.divider, textAlign: 'center' },
  slash: { fontSize: 20, color: colors.gray, marginTop: 16 },
  percentRow: { marginBottom: 14 },
  percentSign: { fontSize: 20, color: colors.gray },
  progressBtns: { flexDirection: 'row', gap: 10 },
  updateBtn: { flex: 1, backgroundColor: colors.purple, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  updateBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
  finishBtn: { flex: 1, backgroundColor: 'rgba(0,206,201,0.15)', borderRadius: radius.md, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.teal },
  finishBtnText: { color: colors.teal, fontSize: 13, fontWeight: '700' },
  addReactionBtn: { backgroundColor: 'rgba(108,92,231,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(108,92,231,0.4)' },
  addReactionText: { color: colors.lavender, fontSize: 12, fontWeight: '500' },
  emptyText: { color: colors.gray, fontSize: 13, textAlign: 'center', padding: 20 },
  timeline: { paddingLeft: 8 },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timelineLine: { alignItems: 'center', width: 20 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.purple, borderWidth: 2, borderColor: colors.lavender },
  timelineConnector: { flex: 1, width: 2, backgroundColor: colors.divider, marginTop: 4 },
  timelineContent: { flex: 1, paddingBottom: 8 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  timelineEmoji: { fontSize: 24 },
  timelinePercent: { fontSize: 12, color: colors.teal, fontWeight: '600' },
  timelineNote: { fontSize: 13, color: colors.white, lineHeight: 18 },
  ratingLabel: { fontSize: 13, color: colors.gray, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: colors.divider, borderRadius: 4, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.white, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: colors.gray, textAlign: 'center', marginBottom: 20 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  emojiBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.divider },
  emojiBtnSelected: { borderColor: colors.purple, backgroundColor: 'rgba(108,92,231,0.2)' },
  emojiText: { fontSize: 24 },
  noteInput: { backgroundColor: colors.card2, borderRadius: radius.sm, padding: 12, color: colors.white, fontSize: 14, borderWidth: 1, borderColor: colors.divider, minHeight: 80, marginBottom: 12 },
  publicToggle: { padding: 12, backgroundColor: colors.card2, borderRadius: radius.sm, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.divider },
  publicToggleText: { color: colors.lavender, fontSize: 14 },
  submitBtn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
});

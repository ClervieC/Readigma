import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { radius, fonts, shadows, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as userBooks from '../../lib/userBooks';
import * as books from '../../lib/books';
import * as timer from '../../lib/timer';
import { formatDuration } from '../../lib/timer';
import { useTimer } from '../../context/TimerContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import Pill from '../../components/Pill';
import ProgressBar from '../../components/ProgressBar';

const EMOJIS = ['😱', '🥰', '😭', '🤯', '😍', '🦋', '😤', '🫶', '💀', '🔥', '😢', '🤩', '😮', '💔', '⭐'];

const STATUS_OPTIONS: { label: string; icon: keyof typeof Feather.glyphMap; value: string }[] = [
  { label: 'À lire', icon: 'bookmark', value: 'to_read' },
  { label: 'En cours', icon: 'book-open', value: 'reading' },
  { label: 'Lu', icon: 'check-circle', value: 'done' },
  { label: 'DNF', icon: 'x-circle', value: 'dnf' },
];

const TABS = [
  { label: 'Aperçu', value: 'apercu' },
  { label: 'Lecture', value: 'lecture' },
  { label: 'Avis', value: 'avis' },
] as const;

function StarRating({ rating, onChange, colors }: { rating: number; onChange: (r: number) => void; colors: ColorPalette }) {
  const steps = [0.25, 0.5, 0.75, 1];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <View key={star} style={{ width: 32, height: 32, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
          {steps.map(step => (
            <TouchableOpacity key={step} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${step * 100}%` as any, zIndex: 1 }}
              onPress={() => onChange(star - 1 + step)} />
          ))}
          <Text style={{ fontSize: 24, zIndex: 0, color: rating >= star ? colors.purple : rating >= star - 0.5 ? colors.lavender : colors.gray }}>
            {rating >= star ? '★' : rating >= star - 0.5 ? '⯨' : '☆'}
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: 13, color: colors.gray, marginLeft: 8 }}>{rating > 0 ? rating.toFixed(2) : '—'}</Text>
    </View>
  );
}

function Card({ title, children, styles }: { title: string; children: React.ReactNode; styles: any }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function BookDetailScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['value']>('apercu');
  const [currentBook, setCurrentBook] = useState<any>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [currentPage, setCurrentPage] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [progressPercent, setProgressPercent] = useState('');
  const [progress, setProgress] = useState(0);
  const [reactions, setReactions] = useState<any[]>([]);
  const [showReactionModal, setShowReactionModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [reactionNote, setReactionNote] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressMode, setProgressMode] = useState<'pages' | 'percent'>('pages');
  const [totalReadingTime, setTotalReadingTime] = useState(0);
  const [timerLoading, setTimerLoading] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [ratingStats, setRatingStats] = useState<{ avg_rating: number | null; ratings_count: number }>({ avg_rating: null, ratings_count: 0 });
  const [reviews, setReviews] = useState<any[]>([]);
  const [seriesInput, setSeriesInput] = useState('');
  const [seriesIndexInput, setSeriesIndexInput] = useState('');
  const [savingSeries, setSavingSeries] = useState(false);
  const [seriesBooks, setSeriesBooks] = useState<any[]>([]);
  const [loadingSeriesBooks, setLoadingSeriesBooks] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const { session: activeSession, elapsedSeconds, start: startGlobalTimer, stop: stopGlobalTimer } = useTimer();

  useEffect(() => {
    if (!id) return;
    userBooks.getBookDetail(id).then(book => {
      setCurrentBook(book);
      setCurrentPage(book.current_page?.toString() || '');
      setTotalPages(book.total_pages?.toString() || '');
      setProgressPercent(book.progress_percent?.toString() || '');
      setProgress(book.progress_percent || 0);
      setProgressMode(book.progress_mode ?? 'pages');
      setRating(book.rating ? parseFloat(book.rating) : 0);
      setComment(book.comment || '');
      setSeriesInput(book.series || '');
      setSeriesIndexInput(book.series_index != null ? String(book.series_index) : '');
      setLoadingBook(false);
      if (book.status === 'reading') setActiveTab('lecture');
      if (book.external_id) {
        books.getWorkExtras(book.external_id).then(extras => {
          setCurrentBook((cur: any) => cur ? {
            ...cur,
            description: cur.description || extras.description,
            firstSentence: extras.firstSentence,
            subjectPlaces: extras.subjectPlaces,
            subjectTimes: extras.subjectTimes,
          } : cur);
        }).catch(() => {});
      }
    }).catch(() => setLoadingBook(false));
    loadReactions();
    timer.getBookReadingTime(id).then(setTotalReadingTime).catch(() => {});
    userBooks.getBookRatingStats(id).then(setRatingStats).catch(() => {});
    userBooks.getBookReviews(id).then(setReviews).catch(() => {});
  }, [id]);

  const loadReactions = () => {
    userBooks.getReactions(id).then(setReactions).catch(() => {});
  };

  // "Other books in this series" is a live search (reusing the same
  // Open Library + BnF merge as the search bar) rather than a query over our
  // own catalog — most series will have only the one volume someone already
  // added, so searching our own `books` table alone would rarely find
  // anything to show.
  useEffect(() => {
    const seriesName = currentBook?.series;
    if (!seriesName) { setSeriesBooks([]); return; }
    setLoadingSeriesBooks(true);
    books.search(seriesName)
      .then(results => setSeriesBooks(results.filter(b => b.external_id !== currentBook.external_id).slice(0, 10)))
      .catch(() => setSeriesBooks([]))
      .finally(() => setLoadingSeriesBooks(false));
  }, [currentBook?.series]);

  const saveSeries = () => {
    const series = seriesInput.trim() || null;
    const series_index = seriesIndexInput.trim() ? parseFloat(seriesIndexInput) : null;
    setSavingSeries(true);
    books.updateBookSeries(id, { series, series_index })
      .then(() => setCurrentBook((cur: any) => ({ ...cur, series, series_index })))
      .catch(() => Alert.alert('Erreur', 'Impossible de sauvegarder la série'))
      .finally(() => setSavingSeries(false));
  };

  const openSeriesBook = (book: any) => {
    books.addBookToDb(book)
      .then(row => router.push(`/book/${row.id}`))
      .catch(() => Alert.alert('Erreur', "Impossible d'ouvrir ce livre"));
  };

  // A book is "being read" the moment you time it, log a page, or react to
  // it — no need to first tap "Commencer à lire" separately. No-ops once
  // already reading/done/dnf.
  const ensureReading = () => {
    if (currentBook.status !== 'to_read') return Promise.resolve();
    setCurrentBook((cur: any) => ({ ...cur, status: 'reading' }));
    return userBooks.addBook(id, 'reading').catch(() => {});
  };

  const startTimer = () => {
    setTimerLoading(true);
    ensureReading()
      .then(() => startGlobalTimer(id))
      .catch(() => Alert.alert('Erreur', 'Impossible de démarrer le chrono'))
      .finally(() => setTimerLoading(false));
  };

  const stopTimer = () => {
    if (!activeSession) return;
    setTimerLoading(true);
    stopGlobalTimer()
      .then(() => timer.getBookReadingTime(id))
      .then(setTotalReadingTime)
      .catch(() => Alert.alert('Erreur', 'Impossible d\'arrêter le chrono'))
      .finally(() => setTimerLoading(false));
  };

  const setFormat = (format: 'physical' | 'ereader') => {
    userBooks.updateBook(id, { format })
      .then(() => setCurrentBook((cur: any) => ({ ...cur, format })))
      .catch(() => Alert.alert('Erreur', 'Impossible de mettre à jour le format'));
  };

  const changeProgressMode = (mode: 'pages' | 'percent') => {
    setProgressMode(mode);
    if (currentBook.progress_mode === mode) return;
    setCurrentBook((cur: any) => ({ ...cur, progress_mode: mode }));
    userBooks.updateBook(id, { progress_mode: mode }).catch(() => {});
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
    ensureReading()
      .then(() => userBooks.updateProgress(id, { current_page: pages || undefined, total_pages: total || undefined, progress_percent: percent }))
      .then((res: any) => { setProgress(res?.progress_percent ?? percent); setLoading(false); Alert.alert('✅', 'Progression mise à jour !'); })
      .catch(() => { setLoading(false); Alert.alert('Erreur', 'Impossible de mettre à jour'); });
  };

  const changeStatus = (status: string) => {
    if (status === 'done') { setShowFinishModal(true); return; }
    userBooks.addBook(id, status)
      .then(() => setCurrentBook((cur: any) => ({ ...cur, status })))
      .catch(() => Alert.alert('Erreur', 'Impossible de mettre à jour'));
  };

  const finishBook = () => {
    userBooks.addBook(id, 'done')
      .then(() => userBooks.updateBook(id, { status: 'done', rating: rating || undefined, comment: comment || undefined }))
      .then(() => {
        setShowFinishModal(false);
        setCurrentBook((cur: any) => ({ ...cur, status: 'done' }));
        userBooks.getBookRatingStats(id).then(setRatingStats).catch(() => {});
        userBooks.getBookReviews(id).then(setReviews).catch(() => {});
        Alert.alert('🎉', 'Félicitations ! Tu as terminé ce livre !');
      })
      .catch((err: any) => Alert.alert('Erreur', err.message || 'Impossible de sauvegarder'));
  };

  const addReaction = () => {
    if (!selectedEmoji) { Alert.alert('Erreur', 'Choisis un emoji !'); return; }
    ensureReading()
      .then(() => userBooks.addReaction(id, { emoji: selectedEmoji, note: reactionNote || undefined, progress_percent: progress, page_number: parseInt(currentPage) || undefined, is_public: isPublic }))
      .then(() => { setShowReactionModal(false); setSelectedEmoji(''); setReactionNote(''); loadReactions(); })
      .catch(() => Alert.alert('Erreur', 'Impossible d\'ajouter'));
  };

  if (loadingBook || !currentBook) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.purple} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const trackable = currentBook.status === 'reading' || currentBook.status === 'to_read';
  const contextTags = [...(currentBook.subjectPlaces ?? []), ...(currentBook.subjectTimes ?? [])].slice(0, 4);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setShowMoreMenu(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="more-vertical" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showMoreMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMoreMenu(false)}>
            <View style={styles.menuSheet}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMoreMenu(false);
                  router.push({ pathname: '/edit-book-suggestion', params: { bookId: id, title: currentBook.title } });
                }}
              >
                <Feather name="edit-3" size={16} color={colors.white} />
                <Text style={styles.menuRowText}>Proposer une modification</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMoreMenu(false);
                  router.push({ pathname: '/report', params: { targetType: 'book', targetId: id, label: currentBook.title } });
                }}
              >
                <Feather name="flag" size={16} color={colors.error} />
                <Text style={[styles.menuRowText, { color: colors.error }]}>Signaler ce livre</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroCover}>
            {currentBook.cover_url ? <Image source={{ uri: currentBook.cover_url }} style={styles.heroCoverImg} /> : <Feather name="book" size={32} color={colors.purple} />}
          </View>
          <Text style={styles.heroTitle}>{currentBook.title}</Text>
          <Text style={styles.heroAuthor}>{currentBook.author}</Text>
          <View style={styles.heroMetaRow}>
            {books.normalizeTags(currentBook.genres)[0] ? <Pill label={books.normalizeTags(currentBook.genres)[0]} tone="gilt" /> : null}
            {currentBook.published_year ? <Text style={styles.year}>{currentBook.published_year}</Text> : null}
            {ratingStats.ratings_count > 0 && (
              <View style={styles.ratingBadgeRow}>
                <Feather name="star" size={11} color={colors.teal} />
                <Text style={styles.ratingBadgeText}>{ratingStats.avg_rating?.toFixed(1)} · {ratingStats.ratings_count}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.tabRow}>
          {TABS.map(t => (
            <Pill key={t.value} label={t.label} active={activeTab === t.value} onPress={() => setActiveTab(t.value)} />
          ))}
        </View>

        <Animated.View key={activeTab} entering={FadeIn.duration(180)}>
          {activeTab === 'apercu' && (
            <>
              {currentBook.description ? (
                <Card title="Résumé" styles={styles}>
                  {currentBook.firstSentence ? <Text style={styles.firstSentence}>« {currentBook.firstSentence} »</Text> : null}
                  <Text style={styles.description} numberOfLines={showFullDescription ? undefined : 6}>{currentBook.description}</Text>
                  {currentBook.description.length > 280 && (
                    <TouchableOpacity onPress={() => setShowFullDescription(v => !v)} hitSlop={8}>
                      <Text style={styles.readMore}>{showFullDescription ? 'Réduire' : 'Lire la suite'}</Text>
                    </TouchableOpacity>
                  )}
                  {contextTags.length > 0 && (
                    <View style={styles.contextTags}>
                      {contextTags.map((tag: string, i: number) => <Pill key={i} label={tag} tone="gilt" />)}
                    </View>
                  )}
                </Card>
              ) : (
                <Text style={styles.emptyText}>Pas encore de résumé pour ce livre.</Text>
              )}

              <Card title="Série" styles={styles}>
                {profile?.role === 'admin' ? (
                  <>
                    <View style={styles.seriesRow}>
                      <TextInput style={[styles.input, { flex: 1, minWidth: 0, textAlign: 'left' }]} value={seriesInput} onChangeText={setSeriesInput}
                        placeholder="Nom de la série (optionnel)" placeholderTextColor={colors.gray} />
                      <TextInput style={[styles.input, styles.seriesIndexInput]} value={seriesIndexInput} onChangeText={setSeriesIndexInput}
                        keyboardType="decimal-pad" placeholder="Tome" placeholderTextColor={colors.gray} />
                    </View>
                    <Button label={savingSeries ? 'Sauvegarde...' : 'Sauvegarder'} onPress={saveSeries} disabled={savingSeries} style={{ marginTop: 12 }} />
                  </>
                ) : currentBook.series ? (
                  <Text style={styles.seriesReadOnly}>
                    {currentBook.series}{currentBook.series_index ? ` — Tome ${currentBook.series_index}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.emptyText}>Ce livre n'est rattaché à aucune série.</Text>
                )}

                {currentBook.series ? (
                  loadingSeriesBooks ? (
                    <ActivityIndicator color={colors.purple} style={{ marginTop: 16 }} />
                  ) : seriesBooks.length > 0 ? (
                    <>
                      <Text style={styles.seriesSubheading}>Autres livres de la série</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                        {seriesBooks.map((b, i) => (
                          <TouchableOpacity key={i} style={styles.seriesBookCard} onPress={() => openSeriesBook(b)} activeOpacity={0.75}>
                            <View style={styles.seriesBookCover}>
                              {b.cover_url ? <Image source={{ uri: b.cover_url }} style={styles.seriesBookCoverImg} /> : <Feather name="book" size={18} color={colors.purple} />}
                            </View>
                            <Text style={styles.seriesBookTitle} numberOfLines={2}>{b.title}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  ) : (
                    <Text style={styles.emptyText}>Aucun autre livre trouvé pour cette série.</Text>
                  )
                ) : null}
              </Card>
            </>
          )}

          {activeTab === 'lecture' && (
            <>
              <Card title="Statut" styles={styles}>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map(s => {
                    const active = currentBook.status === s.value;
                    return (
                      <TouchableOpacity key={s.value} style={[styles.statusChip, active && styles.statusChipActive]} onPress={() => changeStatus(s.value)}>
                        <Feather name={s.icon} size={16} color={active ? 'white' : colors.muted} />
                        <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card>

              <Card title="Format" styles={styles}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pill label="Physique" active={currentBook.format === 'physical'} onPress={() => setFormat('physical')} tone="gilt" />
                  <Pill label="Liseuse" active={currentBook.format === 'ereader'} onPress={() => setFormat('ereader')} tone="gilt" />
                </View>
              </Card>

              {trackable && (
                <Card title="Chrono de lecture" styles={styles}>
                  {activeSession && activeSession.book_id === id ? (
                    <>
                      <Text style={styles.timerFace}>{formatDuration(elapsedSeconds)}</Text>
                      <Button label={timerLoading ? '...' : 'Arrêter'} variant="danger" onPress={stopTimer} disabled={timerLoading} />
                    </>
                  ) : (
                    <Button label={timerLoading ? '...' : 'Démarrer une session'} onPress={startTimer} disabled={timerLoading} />
                  )}
                  {totalReadingTime > 0 && (
                    <Text style={styles.timerTotal}>Temps total sur ce livre : {formatDuration(totalReadingTime)}</Text>
                  )}
                </Card>
              )}

              {trackable && (
                <Card title="Ma progression" styles={styles}>
                  <ProgressBar percent={progress} color={colors.teal} trackColor={colors.card2} />
                  <Text style={styles.progressText}>{Math.round(progress)}% lu</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    <Pill label="Par pages" active={progressMode === 'pages'} onPress={() => changeProgressMode('pages')} />
                    <Pill label="Par %" active={progressMode === 'percent'} onPress={() => changeProgressMode('percent')} />
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
                        <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={progressPercent} onChangeText={setProgressPercent} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.gray} />
                        <Text style={styles.percentSign}>%</Text>
                      </View>
                    </View>
                  )}
                  <Button label={loading ? 'Mise à jour...' : 'Mettre à jour'} onPress={updateProgress} disabled={loading} />
                </Card>
              )}

              {currentBook.status === 'done' && (
                <Card title="Ma note" styles={styles}>
                  <StarRating rating={rating} onChange={setRating} colors={colors} />
                  <TextInput style={[styles.input, { marginTop: 12, textAlign: 'left', height: 80 }]}
                    value={comment} onChangeText={setComment} placeholder="Mon avis sur ce livre... (optionnel)"
                    placeholderTextColor={colors.gray} multiline />
                  <Button label="Sauvegarder" onPress={() => userBooks.updateBook(id, { rating, comment }).then(() => {
                    userBooks.getBookRatingStats(id).then(setRatingStats).catch(() => {});
                    userBooks.getBookReviews(id).then(setReviews).catch(() => {});
                    Alert.alert('✅', 'Note sauvegardée !');
                  })} style={{ marginTop: 12 }} />
                </Card>
              )}

              <Card title="Mon voyage de lecture" styles={styles}>
                <TouchableOpacity style={styles.addReactionBtn} onPress={() => setShowReactionModal(true)}>
                  <Feather name="plus" size={14} color={colors.lavender} />
                  <Text style={styles.addReactionText}>Ajouter une réaction</Text>
                </TouchableOpacity>
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
                              <Feather name={r.is_public ? 'globe' : 'lock'} size={10} color={colors.gray} />
                            </View>
                          </View>
                          {r.note ? <Text style={styles.timelineNote}>{r.note}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </>
          )}

          {activeTab === 'avis' && (
            <>
              <Card title="Avis de la communauté" styles={styles}>
                {ratingStats.ratings_count > 0 && (
                  <View style={styles.communityHeader}>
                    <Text style={styles.communityAvg}>{ratingStats.avg_rating?.toFixed(1)}</Text>
                    <Feather name="star" size={20} color={colors.teal} />
                    <Text style={styles.communityCount}>{ratingStats.ratings_count} avis</Text>
                  </View>
                )}
                {reviews.length === 0 ? (
                  <Text style={styles.emptyText}>Aucun avis pour l'instant — sois le premier à en laisser un !</Text>
                ) : (
                  reviews.map((r, i) => (
                    <View key={i} style={[styles.reviewItem, i < reviews.length - 1 && styles.reviewDivider]}>
                      <View style={styles.reviewAvatar}>
                        {r.avatar_url ? <Image source={{ uri: r.avatar_url }} style={styles.reviewAvatarImg} /> : <Text style={styles.reviewAvatarText}>{r.username?.slice(0, 2).toUpperCase()}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.reviewHeaderRow}>
                          <Text style={styles.reviewUsername}>@{r.username}</Text>
                          {r.rating ? <Text style={styles.reviewRating}>{Number(r.rating).toFixed(2)} ★</Text> : null}
                        </View>
                        {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </>
          )}
        </Animated.View>

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
              <Feather name={isPublic ? 'globe' : 'lock'} size={14} color={colors.lavender} />
              <Text style={styles.publicToggleText}>{isPublic ? 'Partager avec mes amis' : 'Garder privé'}</Text>
            </TouchableOpacity>
            <Button label="Ajouter" onPress={addReaction} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showFinishModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFinishModal(false)}>
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Tu as terminé !</Text>
            <Text style={styles.modalSubtitle}>{currentBook.title}</Text>
            <Text style={styles.ratingLabel}>Ta note (optionnel)</Text>
            <StarRating rating={rating} onChange={setRating} colors={colors} />
            <TextInput style={[styles.noteInput, { marginTop: 16 }]} value={comment} onChangeText={setComment}
              placeholder="Ton avis sur ce livre... (optionnel)" placeholderTextColor={colors.gray} multiline maxLength={500} />
            <Button label="Terminer la lecture" onPress={finishBook} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: 30 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 16 },
  menuRowText: { fontSize: 14, fontWeight: '600', color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 20 },
  hero: { alignItems: 'center', paddingBottom: 20 },
  heroCover: {
    width: 128, height: 184, backgroundColor: colors.card2, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 16, ...shadows.card,
  },
  heroCoverImg: { width: '100%', height: '100%' },
  heroTitle: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center', paddingHorizontal: 20 },
  heroAuthor: { fontSize: 13, color: colors.muted, marginTop: 4 },
  heroMetaRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  year: { fontSize: 11, color: colors.muted },
  ratingBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingBadgeText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 20 },
  card: { marginBottom: 24 },
  cardTitle: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 14 },
  firstSentence: { fontSize: 13, color: colors.lavender, fontStyle: 'italic', lineHeight: 19, marginBottom: 10 },
  description: { fontSize: 13, color: colors.muted, lineHeight: 20 },
  readMore: { fontSize: 12, color: colors.lavender, fontWeight: '600', marginTop: 8 },
  contextTags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  seriesRow: { flexDirection: 'row', gap: 8 },
  seriesIndexInput: { width: 70 },
  seriesReadOnly: { fontSize: 14, color: colors.white, fontWeight: '600' },
  seriesSubheading: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 20, marginBottom: 12 },
  seriesBookCard: { width: 84, alignItems: 'center', gap: 6 },
  seriesBookCover: { width: 64, height: 92, backgroundColor: colors.card2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  seriesBookCoverImg: { width: 64, height: 92 },
  seriesBookTitle: { fontSize: 10, color: colors.white, textAlign: 'center' },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.divider,
  },
  statusChipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  statusChipText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  statusChipTextActive: { color: 'white' },
  timerFace: { fontSize: 36, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center', marginBottom: 14, fontVariant: ['tabular-nums'] },
  timerTotal: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 12 },
  progressText: { fontSize: 12, color: colors.teal, marginTop: 6, marginBottom: 16, textAlign: 'right' },
  pagesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pageInput: { flex: 1 },
  inputLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  input: { backgroundColor: colors.card2, borderRadius: radius.sm, padding: 12, color: colors.white, fontSize: 16, textAlign: 'center' },
  slash: { fontSize: 20, color: colors.muted, marginTop: 16 },
  percentRow: { marginBottom: 14 },
  percentSign: { fontSize: 20, color: colors.muted },
  addReactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  addReactionText: { color: colors.lavender, fontSize: 13, fontWeight: '600' },
  emptyText: { color: colors.muted, fontSize: 13 },
  timeline: { paddingLeft: 4 },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timelineLine: { alignItems: 'center', width: 20 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple },
  timelineConnector: { flex: 1, width: 1, backgroundColor: colors.divider, marginTop: 4 },
  timelineContent: { flex: 1, paddingBottom: 8 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  timelineEmoji: { fontSize: 22 },
  timelinePercent: { fontSize: 12, color: colors.teal, fontWeight: '600' },
  timelineNote: { fontSize: 13, color: colors.white, lineHeight: 18 },
  communityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  communityAvg: { fontSize: 30, fontFamily: fonts.headingBold, color: colors.white },
  communityCount: { fontSize: 12, color: colors.muted },
  reviewItem: { flexDirection: 'row', gap: 12, paddingBottom: 14, marginBottom: 14 },
  reviewDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.purpleGlow, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  reviewAvatarImg: { width: 34, height: 34 },
  reviewAvatarText: { fontSize: 12, fontWeight: '700', color: colors.lavender },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewUsername: { fontSize: 13, fontWeight: '700', color: colors.white },
  reviewRating: { fontSize: 12, color: colors.teal, fontWeight: '600' },
  reviewComment: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  ratingLabel: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle: { width: 36, height: 4, backgroundColor: colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  emojiBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  emojiBtnSelected: { borderWidth: 1, borderColor: colors.purple },
  emojiText: { fontSize: 22 },
  noteInput: { backgroundColor: colors.card2, borderRadius: radius.sm, padding: 12, color: colors.white, fontSize: 14, minHeight: 80, marginBottom: 12 },
  publicToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, marginBottom: 12 },
  publicToggleText: { color: colors.lavender, fontSize: 14 },
});

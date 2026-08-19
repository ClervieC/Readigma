import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import * as sharedReadings from '../../lib/sharedReadings';
import * as follows from '../../lib/follows';
import { alert } from '../../lib/alert';
import { REACTION_EMOJIS } from '../../lib/emojis';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import StarRating from '../../components/StarRating';
import Pill from '../../components/Pill';

const BADGE_META: Record<sharedReadings.SharedReadingBadge['badge'], { emoji: string; labelKey: string }> = {
  first_arrived: { emoji: '🥇', labelKey: 'sharedReadings.badgeFirstArrived' },
  theorist: { emoji: '🧠', labelKey: 'sharedReadings.badgeTheorist' },
  commentator: { emoji: '💬', labelKey: 'sharedReadings.badgeCommentator' },
  finisher: { emoji: '🏁', labelKey: 'sharedReadings.badgeFinisher' },
  marathonien: { emoji: '🏃', labelKey: 'sharedReadings.badgeMarathonien' },
};

export default function SharedReadingDetailScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [reading, setReading] = useState<sharedReadings.SharedReading | null>(null);
  const [roster, setRoster] = useState<sharedReadings.SharedReadingRosterEntry[]>([]);
  const [messages, setMessages] = useState<sharedReadings.SharedReadingMessage[]>([]);
  const [reactionStats, setReactionStats] = useState<sharedReadings.SharedReadingReactionStat[]>([]);
  const [theories, setTheories] = useState<sharedReadings.SharedReadingTheory[]>([]);
  const [proposals, setProposals] = useState<sharedReadings.SharedReadingProposal[]>([]);
  const [badges, setBadges] = useState<sharedReadings.SharedReadingBadge[]>([]);
  const [latestQuiz, setLatestQuiz] = useState<sharedReadings.SharedReadingQuiz | null>(null);
  const [myQuizAnswer, setMyQuizAnswer] = useState<number | null>(null);
  const [quizResults, setQuizResults] = useState<sharedReadings.SharedReadingQuizResult[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [generalMessageText, setGeneralMessageText] = useState('');
  const [theoryText, setTheoryText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postingGeneral, setPostingGeneral] = useState(false);
  const [postingTheory, setPostingTheory] = useState(false);
  const [joining, setJoining] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [togglingLive, setTogglingLive] = useState(false);
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptionA, setQuizOptionA] = useState('');
  const [quizOptionB, setQuizOptionB] = useState('');
  const [quizCorrect, setQuizCorrect] = useState<0 | 1>(0);
  const [postingQuiz, setPostingQuiz] = useState(false);
  const [showReadingMenu, setShowReadingMenu] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editMaxParticipants, setEditMaxParticipants] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([
      sharedReadings.getSharedReading(id),
      sharedReadings.isMemberOf(id).catch(() => false),
    ]).then(([r, member]) => {
      setReading(r);
      setIsMember(member);
      setLoading(false);
      if (member) {
        sharedReadings.getRoster(id).then(setRoster).catch(() => {});
        sharedReadings.getMessages(id).then(setMessages).catch(() => {});
        sharedReadings.getReactionStats(id).then(setReactionStats).catch(() => {});
        sharedReadings.getTheories(id).then(setTheories).catch(() => {});
        sharedReadings.getProposals(id).then(setProposals).catch(() => {});
        sharedReadings.getBadges(id).then(setBadges).catch(() => {});
        sharedReadings.getQuizzes(id).then((quizzes) => {
          const latest = quizzes[0] ?? null;
          setLatestQuiz(latest);
          if (!latest) return;
          sharedReadings.getMyQuizAnswer(latest.id).then((answer) => {
            setMyQuizAnswer(answer);
            if (answer != null) sharedReadings.getQuizResults(latest.id).then(setQuizResults).catch(() => {});
          }).catch(() => {});
        }).catch(() => {});
      }
    }).catch(() => setLoading(false));
  }, [id]);

  useFocusEffect(load);

  const join = () => {
    if (!id) return;
    setJoining(true);
    sharedReadings
      .joinSharedReading(id)
      .then(load)
      .catch(() => alert(t('common.error'), t('sharedReadings.joinError')))
      .finally(() => setJoining(false));
  };

  const leave = () => {
    if (!id || !reading) return;
    const doLeave = () =>
      sharedReadings.leaveSharedReading(id).then(load).catch(() => alert(t('common.error'), t('sharedReadings.leaveError')));
    alert(
      t('sharedReadings.leaveConfirmTitle'),
      reading.is_public ? t('sharedReadings.leaveConfirmPublic') : t('sharedReadings.leaveConfirmPrivate'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('sharedReadings.leave'), style: 'destructive', onPress: doLeave },
      ],
    );
  };

  const openEditForm = () => {
    if (!reading) return;
    setEditIsPublic(reading.is_public);
    setEditMaxParticipants(reading.max_participants != null ? String(reading.max_participants) : '');
    setShowReadingMenu(false);
    setShowEditForm(true);
  };

  const saveEdit = () => {
    if (!id) return;
    setSavingEdit(true);
    sharedReadings
      .updateSharedReading(id, {
        isPublic: editIsPublic,
        maxParticipants: editMaxParticipants.trim() ? parseInt(editMaxParticipants, 10) : null,
      })
      .then(() => {
        setShowEditForm(false);
        return load();
      })
      .catch(() => alert(t('common.error'), t('sharedReadings.editError')))
      .finally(() => setSavingEdit(false));
  };

  const deleteReading = () => {
    if (!id) return;
    setShowReadingMenu(false);
    // router.back() would be unreliable here: this screen may be reached
    // via a deep link/notification with no meaningful "back" entry, and
    // even when it does have one it can't be un-deleted into — replacing
    // with the shared-readings list is the one destination guaranteed to
    // exist and make sense right after deleting what you were looking at.
    const doDelete = () =>
      sharedReadings.deleteSharedReading(id)
        .then(() => router.replace('/(tabs)/shared-readings'))
        .catch(() => alert(t('common.error'), t('sharedReadings.deleteReadingError')));
    alert(t('sharedReadings.deleteConfirmTitle'), t('sharedReadings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sharedReadings.delete'), style: 'destructive', onPress: doDelete },
    ]);
  };

  const removeMember = (memberId: string) => {
    if (!id) return;
    const doRemove = () =>
      sharedReadings.removeMember(id, memberId).then(load).catch(() => alert(t('common.error'), t('sharedReadings.removeMemberError')));
    alert(t('sharedReadings.removeMemberConfirmTitle'), t('sharedReadings.removeMemberConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sharedReadings.remove'), style: 'destructive', onPress: doRemove },
    ]);
  };

  const searchMembers = () => {
    if (!memberQuery.trim()) return;
    setSearchingMembers(true);
    follows.searchUsers(memberQuery.trim())
      .then(setMemberResults)
      .catch(() => setMemberResults([]))
      .finally(() => setSearchingMembers(false));
  };

  const addMemberToReading = (userId: string) => {
    if (!id) return;
    setAddingMemberId(userId);
    sharedReadings.addMember(id, userId)
      .then(() => {
        setMemberResults((cur) => cur.filter((u) => u.id !== userId));
        return load();
      })
      .catch(() => alert(t('common.error'), t('sharedReadings.addMemberError')))
      .finally(() => setAddingMemberId(null));
  };

  const deleteMessage = (messageId: string) => {
    if (!id) return;
    const doDelete = () =>
      sharedReadings.deleteMessage(messageId)
        .then(() => sharedReadings.getMessages(id).then(setMessages))
        .catch(() => alert(t('common.error'), t('sharedReadings.deleteMessageError')));
    alert(t('sharedReadings.deleteMessageConfirmTitle'), t('sharedReadings.deleteMessageConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sharedReadings.delete'), style: 'destructive', onPress: doDelete },
    ]);
  };

  const reportMessage = (messageId: string, content: string) => {
    router.push({
      pathname: '/report',
      params: { targetType: 'shared_reading_message', targetId: messageId, label: content.slice(0, 80) },
    });
  };

  const submitMessage = () => {
    if (!id || !reading || !messageText.trim()) return;
    setPosting(true);
    sharedReadings
      .postMessage(id, reading.book_id, messageText.trim())
      .then(() => {
        setMessageText('');
        return sharedReadings.getMessages(id).then(setMessages);
      })
      .catch(() => alert(t('common.error'), t('sharedReadings.postError')))
      .finally(() => setPosting(false));
  };

  const submitGeneralMessage = () => {
    if (!id || !generalMessageText.trim()) return;
    setPostingGeneral(true);
    sharedReadings
      .postGeneralMessage(id, generalMessageText.trim())
      .then(() => {
        setGeneralMessageText('');
        return sharedReadings.getMessages(id).then(setMessages);
      })
      .catch(() => alert(t('common.error'), t('sharedReadings.postError')))
      .finally(() => setPostingGeneral(false));
  };

  const react = (emoji: string) => {
    if (!id || !reading || reacting) return;
    setReacting(true);
    sharedReadings
      .react(id, reading.book_id, emoji)
      .then(() => sharedReadings.getReactionStats(id).then(setReactionStats))
      .catch(() => alert(t('common.error'), t('sharedReadings.reactError')))
      .finally(() => setReacting(false));
  };

  const submitTheory = () => {
    if (!id || !theoryText.trim()) return;
    setPostingTheory(true);
    sharedReadings
      .postTheory(id, theoryText.trim())
      .then(() => {
        setTheoryText('');
        return sharedReadings.getTheories(id).then(setTheories);
      })
      .catch(() => alert(t('common.error'), t('sharedReadings.theoryError')))
      .finally(() => setPostingTheory(false));
  };

  const resolve = (theoryId: string, isCorrect: boolean) => {
    if (!id) return;
    sharedReadings
      .resolveTheory(theoryId, isCorrect)
      .then(() => sharedReadings.getTheories(id).then(setTheories))
      .catch(() => alert(t('common.error'), t('sharedReadings.theoryError')));
  };

  const vote = (proposalId: string) => {
    if (!id) return;
    sharedReadings
      .voteFor(id, proposalId)
      .then(() => sharedReadings.getProposals(id).then(setProposals))
      .catch(() => alert(t('common.error'), t('sharedReadings.voteError')));
  };

  const toggleLive = () => {
    if (!id || !reading) return;
    setTogglingLive(true);
    sharedReadings
      .setLive(id, !reading.is_live)
      .then(load)
      .catch(() => alert(t('common.error'), t('sharedReadings.liveError')))
      .finally(() => setTogglingLive(false));
  };

  const submitQuiz = () => {
    if (!id || !quizQuestion.trim() || !quizOptionA.trim() || !quizOptionB.trim()) return;
    setPostingQuiz(true);
    sharedReadings
      .createQuiz(id, quizQuestion.trim(), [quizOptionA.trim(), quizOptionB.trim()], quizCorrect)
      .then(() => {
        setShowQuizForm(false);
        setQuizQuestion('');
        setQuizOptionA('');
        setQuizOptionB('');
        return load();
      })
      .catch(() => alert(t('common.error'), t('sharedReadings.quizError')))
      .finally(() => setPostingQuiz(false));
  };

  const submitQuizAnswer = (option: number) => {
    if (!latestQuiz || myQuizAnswer != null) return;
    setMyQuizAnswer(option);
    sharedReadings
      .answerQuiz(latestQuiz.id, option)
      .then(() => sharedReadings.getQuizResults(latestQuiz.id).then(setQuizResults))
      .catch(() => {
        setMyQuizAnswer(null);
        alert(t('common.error'), t('sharedReadings.quizError'));
      });
  };

  const rate = (value: number) => {
    if (!id) return;
    setRoster((cur) => cur.map((r) => (r.user_id === profile?.id ? { ...r, rating: value } : r)));
    sharedReadings.rateSharedReading(id, value).catch(() => load());
  };

  if (loading || !reading) {
    return (
      <Screen back title={t('sharedReadings.detailTitle')} atmosphere="purple">
        <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  const myEntry = roster.find((r) => r.user_id === profile?.id);
  // Linear pace between starts_at/ends_at (both optional) — "today you
  // should be at X%". This is a straight-line target based on the
  // schedule the creator set, not a velocity-based estimate (that would
  // need reading-pace history over time, which isn't tracked here).
  let expectedPercent: number | null = null;
  if (reading.starts_at && reading.ends_at) {
    const start = new Date(reading.starts_at).getTime();
    const end = new Date(reading.ends_at).getTime();
    const totalDays = (end - start) / 86400000;
    if (totalDays > 0) {
      const elapsedDays = (Date.now() - start) / 86400000;
      expectedPercent = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
    }
  }
  // Simple dashboard, computed client-side from the roster we already
  // fetched — no need for a dedicated RPC for three numbers.
  const avgProgress = roster.length
    ? roster.reduce((sum, r) => sum + r.progress_percent, 0) / roster.length
    : 0;
  const mostAdvanced = roster[0]; // getRoster already orders desc by progress
  const mostBehind = roster[roster.length - 1];
  // Group reaction stats by bucket → { emoji: count } for a compact display
  // ("82% 🤯" at a given point in the book, without ever showing *why*).
  const reactionsByBucket = reactionStats.reduce<Record<number, sharedReadings.SharedReadingReactionStat[]>>(
    (acc, s) => {
      (acc[s.percent_bucket] ??= []).push(s);
      return acc;
    },
    {},
  );
  // The standout idea from the original pitch: instead of two separate
  // flat lists (reaction stats, messages), one chronological rail ordered
  // by point-in-book — content reveals itself as you scroll down it, same
  // way it reveals itself as you actually read.
  type TimelineEntry =
    | { kind: 'message'; percent: number; message: sharedReadings.SharedReadingMessage }
    | { kind: 'reaction'; percent: number; emoji: string; percentage: number };
  const bookMessages = messages.filter((m) => m.kind !== 'general');
  const generalMessages = messages.filter((m) => m.kind === 'general');
  const timeline: TimelineEntry[] = [
    ...bookMessages.map((m): TimelineEntry => ({ kind: 'message', percent: m.percent_threshold, message: m })),
    ...Object.entries(reactionsByBucket).map(([bucket, stats]): TimelineEntry => {
      const total = stats.reduce((s, x) => s + x.count, 0);
      const top = [...stats].sort((a, b) => b.count - a.count)[0];
      return { kind: 'reaction', percent: Number(bucket), emoji: top.emoji, percentage: Math.round((top.count / total) * 100) };
    }),
  ].sort((a, b) => a.percent - b.percent);
  const ratings = roster.map((r) => r.rating).filter((r): r is number => r != null);
  const avgRating = ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;
  const isCreator = reading.creator_id === profile?.id;
  const dnfCount = roster.filter((r) => r.status === 'dnf').length;
  const mostReactedBucket = Object.entries(reactionsByBucket)
    .map(([bucket, stats]) => ({ bucket, total: stats.reduce((s, x) => s + x.count, 0) }))
    .sort((a, b) => b.total - a.total)[0];

  return (
    <Screen
      back
      title={reading.book?.title ?? t('sharedReadings.detailTitle')}
      right={
        isCreator ? (
          <TouchableOpacity onPress={() => setShowReadingMenu(true)} hitSlop={8} accessibilityLabel={t('sharedReadings.optionsMenu')}>
            <Feather name="more-vertical" size={20} color={colors.white} />
          </TouchableOpacity>
        ) : undefined
      }
      atmosphere="purple"
    >
      <View style={styles.bookRow}>
        <View style={styles.cover}>
          {reading.book?.cover_url ? (
            <Image source={{ uri: reading.book.cover_url }} style={styles.coverImg} />
          ) : (
            <Feather name="book" size={20} color={colors.purple} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bookTitle}>{reading.book?.title}</Text>
          <Text style={styles.bookAuthor}>{reading.book?.author}</Text>
          {reading.is_live && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>{t('sharedReadings.liveNow')}</Text>
            </View>
          )}
        </View>
      </View>

      {!isMember ? (
        <Button
          label={reading.is_public ? t('sharedReadings.join') : t('sharedReadings.privateNoJoin')}
          onPress={join}
          loading={joining}
          disabled={!reading.is_public}
          style={{ marginBottom: 24 }}
        />
      ) : (
        <>
          {expectedPercent != null && (
            <View style={styles.paceBanner}>
              <Feather name="calendar" size={14} color={colors.purple} />
              <Text style={styles.paceBannerText}>
                {t('sharedReadings.expectedPace', { percent: Math.round(expectedPercent) })}
                {myEntry && (
                  myEntry.progress_percent >= expectedPercent
                    ? ` — ${t('sharedReadings.onTrack')}`
                    : ` — ${t('sharedReadings.behindPace')}`
                )}
              </Text>
            </View>
          )}

          {isCreator && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              <Button
                label={reading.is_live ? t('sharedReadings.endLive') : t('sharedReadings.startLive')}
                variant={reading.is_live ? 'danger' : 'primary'}
                onPress={toggleLive}
                loading={togglingLive}
                style={{ flex: 1 }}
              />
              <Button
                label={t('sharedReadings.newQuiz')}
                variant="ghost"
                onPress={() => setShowQuizForm((v) => !v)}
                style={{ flex: 1 }}
              />
            </View>
          )}

          {isCreator && showQuizForm && (
            <View style={styles.quizForm}>
              <TextInput
                style={styles.input}
                value={quizQuestion}
                onChangeText={setQuizQuestion}
                placeholder={t('sharedReadings.quizQuestionPlaceholder')}
                placeholderTextColor={colors.gray}
              />
              {([0, 1] as const).map((i) => (
                <View key={i} style={styles.quizOptionRow}>
                  <TouchableOpacity onPress={() => setQuizCorrect(i)} hitSlop={6}>
                    <Feather
                      name={quizCorrect === i ? 'check-circle' : 'circle'}
                      size={18}
                      color={quizCorrect === i ? colors.success : colors.gray}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={i === 0 ? quizOptionA : quizOptionB}
                    onChangeText={i === 0 ? setQuizOptionA : setQuizOptionB}
                    placeholder={t('sharedReadings.quizOptionPlaceholder', { n: i + 1 })}
                    placeholderTextColor={colors.gray}
                  />
                </View>
              ))}
              <Button label={t('sharedReadings.postQuiz')} onPress={submitQuiz} loading={postingQuiz} />
            </View>
          )}

          {latestQuiz && (
            <View style={styles.quizCard}>
              <Text style={styles.sectionTitle}>{latestQuiz.question}</Text>
              {myQuizAnswer == null ? (
                latestQuiz.options.map((opt, i) => (
                  <TouchableOpacity key={i} style={styles.quizAnswerRow} onPress={() => submitQuizAnswer(i)}>
                    <Text style={styles.messageContent}>{opt}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                latestQuiz.options.map((opt, i) => {
                  const result = quizResults.find((r) => r.selected_option === i);
                  const total = quizResults.reduce((s, r) => s + r.count, 0);
                  const percent = total ? Math.round(((result?.count ?? 0) / total) * 100) : 0;
                  return (
                    <View key={i} style={styles.quizAnswerRow}>
                      <Text style={[styles.messageContent, result?.is_correct && { color: colors.success }]}>
                        {opt} {result?.is_correct ? '✅' : ''} — {percent}%
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {isCreator && (
            <>
              <Text style={styles.sectionTitle}>{t('sharedReadings.creatorDashboard')}</Text>
              <Text style={styles.spoilerHint}>{t('sharedReadings.creatorDashboardHint')}</Text>
              <View style={styles.dashboard}>
                <View style={styles.dashboardStat}>
                  <Text style={styles.dashboardValue}>{roster.length}</Text>
                  <Text style={styles.dashboardLabel}>{t('sharedReadings.participants')}</Text>
                </View>
                <View style={styles.dashboardStat}>
                  <Text style={styles.dashboardValue}>{dnfCount}</Text>
                  <Text style={styles.dashboardLabel}>{t('sharedReadings.dnfCount')}</Text>
                </View>
                <View style={styles.dashboardStat}>
                  <Text style={styles.dashboardValue}>{messages.length}</Text>
                  <Text style={styles.dashboardLabel}>{t('sharedReadings.messageCount')}</Text>
                </View>
              </View>
              {mostReactedBucket && (
                <Text style={styles.avgRatingText}>
                  {t('sharedReadings.hottestPoint', { bucket: mostReactedBucket.bucket })}
                </Text>
              )}
            </>
          )}

          {roster.length > 1 && (
            <View style={styles.dashboard}>
              <View style={styles.dashboardStat}>
                <Text style={styles.dashboardValue}>{Math.round(avgProgress)}%</Text>
                <Text style={styles.dashboardLabel}>{t('sharedReadings.avgProgress')}</Text>
              </View>
              <View style={styles.dashboardStat}>
                <Text style={styles.dashboardValue} numberOfLines={1}>{mostAdvanced?.username}</Text>
                <Text style={styles.dashboardLabel}>{t('sharedReadings.mostAdvanced')}</Text>
              </View>
              <View style={styles.dashboardStat}>
                <Text style={styles.dashboardValue} numberOfLines={1}>{mostBehind?.username}</Text>
                <Text style={styles.dashboardLabel}>{t('sharedReadings.mostBehind')}</Text>
              </View>
            </View>
          )}

          {badges.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t('sharedReadings.badges')}</Text>
              <View style={styles.badgesRow}>
                {badges.map((b, i) => (
                  <View key={i} style={styles.badgeChip}>
                    <Text style={styles.badgeEmoji}>{BADGE_META[b.badge].emoji}</Text>
                    <View>
                      <Text style={styles.badgeLabel}>{t(BADGE_META[b.badge].labelKey)}</Text>
                      <Text style={styles.badgeUsername} numberOfLines={1}>{b.username}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t('sharedReadings.roster')}</Text>
            {isCreator && !reading.is_public && (
              <TouchableOpacity onPress={() => setShowAddMember(true)} hitSlop={8}>
                <Feather name="user-plus" size={16} color={colors.purple} />
              </TouchableOpacity>
            )}
          </View>
          {roster.map((r) => (
            <View key={r.user_id} style={styles.rosterRow}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarText}>{r.username?.slice(0, 2).toUpperCase()}</Text>
              </View>
              <Text style={styles.rosterName} numberOfLines={1}>{r.username}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, r.progress_percent)}%` as any }]} />
              </View>
              <Text style={styles.progressLabel}>{Math.round(r.progress_percent)}%</Text>
              {isCreator && r.user_id !== profile?.id && (
                <TouchableOpacity onPress={() => removeMember(r.user_id)} hitSlop={8}>
                  <Feather name="user-x" size={16} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('sharedReadings.generalChat')}</Text>
          <Text style={styles.spoilerHint}>{t('sharedReadings.generalChatHint')}</Text>
          {generalMessages.length === 0 ? (
            <Text style={styles.emptyText}>{t('sharedReadings.noMessages')}</Text>
          ) : (
            generalMessages.map((m) => (
              <View key={m.id} style={styles.generalMessageRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.messageAuthor}>{m.username}</Text>
                  <Text style={styles.messageContent}>{m.content}</Text>
                </View>
                {m.user_id === profile?.id ? (
                  <TouchableOpacity onPress={() => deleteMessage(m.id)} hitSlop={8}>
                    <Feather name="trash-2" size={14} color={colors.gray} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => reportMessage(m.id, m.content)} hitSlop={8}>
                    <Feather name="flag" size={14} color={colors.gray} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={generalMessageText}
              onChangeText={setGeneralMessageText}
              placeholder={t('sharedReadings.generalChatPlaceholder')}
              placeholderTextColor={colors.gray}
              multiline
            />
            <TouchableOpacity onPress={submitGeneralMessage} disabled={postingGeneral || !generalMessageText.trim()} hitSlop={8} accessibilityLabel={t('sharedReadings.sendMessage')}>
              <Feather name="send" size={20} color={generalMessageText.trim() ? colors.purple : colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('sharedReadings.timeline')}</Text>
          <Text style={styles.spoilerHint}>
            {t('sharedReadings.spoilerHint', { percent: Math.round(myEntry?.progress_percent ?? 0) })}
          </Text>
          <View style={styles.reactionPicker}>
            {REACTION_EMOJIS.slice(0, 6).map((e) => (
              <TouchableOpacity key={e} onPress={() => react(e)} disabled={reacting} hitSlop={4}>
                <Text style={styles.reactionPickerEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {timeline.length === 0 ? (
            <Text style={styles.emptyText}>{t('sharedReadings.noMessages')}</Text>
          ) : (
            timeline.map((item, i) => (
              <View key={i} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot}>
                    <Text style={styles.timelineDotText}>{Math.round(item.percent)}</Text>
                  </View>
                  {i < timeline.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  {item.kind === 'message' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.messageAuthor}>{item.message.username}</Text>
                        <Text style={styles.messageContent}>{item.message.content}</Text>
                      </View>
                      {item.message.user_id === profile?.id ? (
                        <TouchableOpacity onPress={() => deleteMessage(item.message.id)} hitSlop={8}>
                          <Feather name="trash-2" size={14} color={colors.gray} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => reportMessage(item.message.id, item.message.content)} hitSlop={8}>
                          <Feather name="flag" size={14} color={colors.gray} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.reactionStat}>
                      {t('sharedReadings.reactionStatShort', { percent: item.percentage, emoji: item.emoji })}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}

          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder={t('sharedReadings.messagePlaceholder')}
              placeholderTextColor={colors.gray}
              multiline
            />
            <TouchableOpacity onPress={submitMessage} disabled={posting || !messageText.trim()} hitSlop={8} accessibilityLabel={t('sharedReadings.sendMessage')}>
              <Feather name="send" size={20} color={messageText.trim() ? colors.purple : colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('sharedReadings.theories')}</Text>
          <Text style={styles.spoilerHint}>{t('sharedReadings.theoriesHint')}</Text>
          {theories.length === 0 ? (
            <Text style={styles.emptyText}>{t('sharedReadings.noTheories')}</Text>
          ) : (
            theories.map((th) => {
              const isMine = th.user_id === profile?.id;
              return (
                <View key={th.id} style={styles.theoryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.messageAuthor}>{isMine ? t('sharedReadings.you') : th.profile?.username}</Text>
                    <Text style={styles.messageContent}>{th.content}</Text>
                  </View>
                  {th.is_correct !== null ? (
                    <View style={[styles.theoryBadge, th.is_correct ? styles.theoryBadgeCorrect : styles.theoryBadgeWrong]}>
                      <Text style={styles.theoryBadgeText}>
                        {th.is_correct ? t('sharedReadings.correct') : t('sharedReadings.incorrect')}
                      </Text>
                    </View>
                  ) : isMine ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => resolve(th.id, true)} hitSlop={6} accessibilityLabel={t('sharedReadings.markCorrect')}>
                        <Feather name="check" size={18} color={colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => resolve(th.id, false)} hitSlop={6} accessibilityLabel={t('sharedReadings.markIncorrect')}>
                        <Feather name="x" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={theoryText}
              onChangeText={setTheoryText}
              placeholder={t('sharedReadings.theoryPlaceholder')}
              placeholderTextColor={colors.gray}
              multiline
            />
            <TouchableOpacity onPress={submitTheory} disabled={postingTheory || !theoryText.trim()} hitSlop={8} accessibilityLabel={t('sharedReadings.sendTheory')}>
              <Feather name="send" size={20} color={theoryText.trim() ? colors.purple : colors.gray} />
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('sharedReadings.nextBookVote')}</Text>
            <TouchableOpacity onPress={() => router.push(`/shared-readings/propose?readingId=${id}`)} hitSlop={8}>
              <Feather name="plus-circle" size={18} color={colors.purple} />
            </TouchableOpacity>
          </View>
          {proposals.length === 0 ? (
            <Text style={styles.emptyText}>{t('sharedReadings.noProposals')}</Text>
          ) : (
            proposals.map((p) => (
              <TouchableOpacity
                key={p.proposal_id}
                style={[styles.proposalRow, p.voted_by_me && styles.proposalRowVoted]}
                onPress={() => vote(p.proposal_id)}
              >
                <View style={styles.cover}>
                  {p.cover_url ? (
                    <Image source={{ uri: p.cover_url }} style={styles.coverImg} />
                  ) : (
                    <Feather name="book" size={18} color={colors.purple} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>{p.author}</Text>
                </View>
                <View style={styles.voteCount}>
                  <Feather name="thumbs-up" size={14} color={p.voted_by_me ? colors.purple : colors.gray} />
                  <Text style={[styles.voteCountText, p.voted_by_me && { color: colors.purple }]}>{p.vote_count}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('sharedReadings.rateExperience')}</Text>
          <StarRating rating={myEntry?.rating ?? 0} onChange={rate} colors={colors} />
          {avgRating != null && (
            <Text style={styles.avgRatingText}>
              {t('sharedReadings.avgRating', { rating: avgRating.toFixed(2), count: ratings.length })}
            </Text>
          )}

          <TouchableOpacity onPress={leave} style={{ marginTop: 20 }}>
            <Text style={styles.leaveText}>{t('sharedReadings.leave')}</Text>
          </TouchableOpacity>
        </>
      )}

      {showReadingMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowReadingMenu(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowReadingMenu(false)}>
            <View style={styles.menuSheet}>
              <TouchableOpacity style={styles.menuRow} onPress={openEditForm}>
                <Feather name="edit-2" size={16} color={colors.white} />
                <Text style={styles.menuRowText}>{t('sharedReadings.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuRow} onPress={deleteReading}>
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={[styles.menuRowText, { color: colors.error }]}>{t('sharedReadings.deleteReading')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showEditForm && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowEditForm(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowEditForm(false)}>
            <TouchableOpacity style={styles.editSheet} activeOpacity={1}>
              <Text style={styles.sectionTitle}>{t('sharedReadings.edit')}</Text>
              <Text style={styles.label}>{t('sharedReadings.visibility')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Pill label={t('sharedReadings.public')} active={editIsPublic} onPress={() => setEditIsPublic(true)} />
                <Pill label={t('sharedReadings.private')} active={!editIsPublic} onPress={() => setEditIsPublic(false)} />
              </View>
              <Text style={styles.label}>{t('sharedReadings.maxParticipants')}</Text>
              <TextInput
                style={styles.input}
                value={editMaxParticipants}
                onChangeText={setEditMaxParticipants}
                placeholder={t('sharedReadings.maxParticipantsPlaceholder')}
                placeholderTextColor={colors.gray}
                keyboardType="number-pad"
              />
              <Button label={t('sharedReadings.save')} onPress={saveEdit} loading={savingEdit} style={{ marginTop: 16 }} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {showAddMember && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => { setShowAddMember(false); setMemberQuery(''); setMemberResults([]); }}
        >
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => { setShowAddMember(false); setMemberQuery(''); setMemberResults([]); }}
          >
            <TouchableOpacity style={styles.editSheet} activeOpacity={1}>
              <Text style={styles.sectionTitle}>{t('sharedReadings.addMember')}</Text>
              <View style={styles.memberSearchBar}>
                <Feather name="search" size={15} color={colors.gray} />
                <TextInput
                  style={styles.memberSearchInput}
                  value={memberQuery}
                  onChangeText={setMemberQuery}
                  onSubmitEditing={searchMembers}
                  placeholder={t('sharedReadings.addMemberSearchPlaceholder')}
                  placeholderTextColor={colors.gray}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              </View>
              {searchingMembers ? (
                <ActivityIndicator color={colors.purple} />
              ) : memberResults.length === 0 ? (
                memberQuery.trim() ? <Text style={styles.emptyText}>{t('sharedReadings.noUsersFound')}</Text> : null
              ) : (
                memberResults.map((u) => (
                  <View key={u.id} style={styles.memberResultRow}>
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarText}>{u.username?.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.rosterName} numberOfLines={1}>{u.username}</Text>
                    <TouchableOpacity
                      onPress={() => addMemberToReading(u.id)}
                      disabled={addingMemberId === u.id}
                      hitSlop={8}
                    >
                      {addingMemberId === u.id ? (
                        <ActivityIndicator size="small" color={colors.purple} />
                      ) : (
                        <Text style={{ color: colors.purple, fontFamily: fonts.bodySemiBold, fontSize: 13 }}>
                          {t('sharedReadings.add')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    bookRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    cover: { width: 52, height: 76, borderRadius: 8, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    coverImg: { width: '100%', height: '100%' },
    bookTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
    bookAuthor: { fontSize: 13, color: colors.gray, marginTop: 2 },
    liveBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.error + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
      marginTop: 6, alignSelf: 'flex-start',
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
    liveBadgeText: { fontSize: 10, fontFamily: fonts.headingBold, color: colors.error },
    input: {
      backgroundColor: colors.card2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8,
      fontSize: 13, color: colors.white,
    },
    quizForm: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 16, gap: 8 },
    quizOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    quizCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 20 },
    quizAnswerRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
    sectionTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white, marginBottom: 12 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    memberSearchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card2, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
    },
    memberSearchInput: { flex: 1, fontSize: 14, color: colors.white },
    memberResultRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.divider,
    },
    paceBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 16,
    },
    paceBannerText: { fontSize: 12, color: colors.muted, flex: 1 },
    dashboard: {
      flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.md,
      padding: 14, marginBottom: 20, gap: 8,
    },
    dashboardStat: { flex: 1, alignItems: 'center' },
    dashboardValue: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white },
    dashboardLabel: { fontSize: 10, color: colors.gray, marginTop: 4, textAlign: 'center' },
    reactionPicker: { flexDirection: 'row', gap: 14, marginBottom: 16 },
    reactionPickerEmoji: { fontSize: 26 },
    reactionStat: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
    timelineRow: { flexDirection: 'row' },
    timelineRail: { width: 32, alignItems: 'center' },
    timelineDot: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: colors.purpleGlow,
      alignItems: 'center', justifyContent: 'center',
    },
    timelineDotText: { fontSize: 9, fontFamily: fonts.headingBold, color: colors.purple },
    timelineLine: { width: 2, flex: 1, backgroundColor: colors.divider, marginVertical: 2 },
    timelineContent: { flex: 1, paddingBottom: 18, paddingLeft: 4 },
    rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    avatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 10, fontFamily: fonts.headingBold, color: colors.purple },
    rosterName: { fontSize: 13, color: colors.white, width: 80 },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.card2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: colors.purple, borderRadius: 3 },
    progressLabel: { fontSize: 11, color: colors.gray, width: 36, textAlign: 'right' },
    spoilerHint: { fontSize: 12, color: colors.gray, marginBottom: 12, fontStyle: 'italic' },
    emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingVertical: 20 },
    messageAuthor: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.white },
    messageContent: { fontSize: 13, color: colors.muted, marginTop: 2 },
    generalMessageRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8,
    },
    composer: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      backgroundColor: colors.card, borderRadius: radius.md, padding: 10, marginTop: 12,
    },
    composerInput: { flex: 1, fontSize: 13, color: colors.white, maxHeight: 100 },
    leaveText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    menuSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: 30 },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 16 },
    menuRowText: { fontSize: 14, fontWeight: '600', color: colors.white },
    editSheet: {
      backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingBottom: 40,
    },
    label: { fontSize: 13, color: colors.gray, marginBottom: 8, marginTop: 4 },
    avgRatingText: { fontSize: 12, color: colors.gray, marginTop: 8 },
    theoryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
    theoryBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    theoryBadgeCorrect: { backgroundColor: colors.success + '33' },
    theoryBadgeWrong: { backgroundColor: colors.error + '33' },
    theoryBadgeText: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.white },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    proposalRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.card, borderRadius: radius.md, padding: 10, marginBottom: 8,
    },
    proposalRowVoted: { borderWidth: 1, borderColor: colors.purple },
    voteCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    voteCountText: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.gray },
    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    badgeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10,
    },
    badgeEmoji: { fontSize: 20 },
    badgeLabel: { fontSize: 11, color: colors.gray },
    badgeUsername: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.white, maxWidth: 90 },
  });

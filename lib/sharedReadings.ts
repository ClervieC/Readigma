import { supabase, getCurrentUserId } from './supabase';
import { API_BASE } from './apiUrl';

export type SharedReading = {
  id: string;
  book_id: string;
  creator_id: string;
  is_public: boolean;
  max_participants: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_live: boolean;
  created_at: string;
  book?: {
    title: string;
    author: string;
    cover_url: string | null;
  };
};

export type SharedReadingQuiz = {
  id: string;
  question: string;
  options: string[];
  correct_option: number;
  created_at: string;
};

export type SharedReadingQuizResult = {
  selected_option: number;
  count: number;
  is_correct: boolean;
};

export type SharedReadingRosterEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  progress_percent: number;
  rating: number | null;
  status: 'to_read' | 'reading' | 'done' | 'dnf' | null;
};

export type SharedReadingMessage = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  percent_threshold: number;
  created_at: string;
  kind: 'book' | 'general';
};

export type SharedReadingReactionStat = {
  percent_bucket: number;
  emoji: string;
  count: number;
};

export type SharedReadingTheory = {
  id: string;
  user_id: string;
  content: string;
  is_correct: boolean | null;
  created_at: string;
  resolved_at: string | null;
  profile?: { username: string; avatar_url: string | null };
};

export type SharedReadingBadge = {
  badge: 'first_arrived' | 'theorist' | 'commentator' | 'finisher' | 'marathonien';
  user_id: string;
  username: string;
};

export type SharedReadingProposal = {
  proposal_id: string;
  book_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  proposed_by: string;
  proposed_by_username: string;
  vote_count: number;
  voted_by_me: boolean;
};

const BOOK_SELECT = '*,book:books(title,author,cover_url)';

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

// Fire-and-forget, same pattern as lib/follows.ts's own notify() — a failed
// push shouldn't block the action that triggered it.
function notify(toUserId: string, title: string, body: string) {
  fetch(`${API_BASE}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId, title, body }),
  }).catch(() => {});
}

async function notifyOtherMembers(readingId: string, excludeUserId: string, title: string, body: string) {
  const { data } = await supabase
    .from('shared_reading_members')
    .select('user_id')
    .eq('shared_reading_id', readingId)
    .neq('user_id', excludeUserId);
  (data ?? []).forEach((m) => notify(m.user_id, title, body));
}

export async function listPublicSharedReadings(): Promise<SharedReading[]> {
  const { data, error } = await supabase
    .from('shared_readings')
    .select(BOOK_SELECT)
    .eq('is_public', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Readings I created or joined — the RLS select policy already limits rows
// to public ones, my own, or ones I'm a member of, so this is just "all
// rows I'm allowed to see" narrowed to membership.
export async function getMySharedReadings(): Promise<SharedReading[]> {
  const userId = await requireUserId();
  const { data: memberRows, error: memberError } = await supabase
    .from('shared_reading_members')
    .select('shared_reading_id')
    .eq('user_id', userId);
  if (memberError) throw new Error(memberError.message);
  const ids = (memberRows ?? []).map((r) => r.shared_reading_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('shared_readings')
    .select(BOOK_SELECT)
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSharedReading(id: string): Promise<SharedReading> {
  const { data, error } = await supabase
    .from('shared_readings')
    .select(BOOK_SELECT)
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSharedReading(
  bookId: string,
  opts: { isPublic: boolean; maxParticipants?: number | null; startsAt?: string | null; endsAt?: string | null },
): Promise<SharedReading> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('shared_readings')
    .insert({
      book_id: bookId,
      creator_id: userId,
      is_public: opts.isPublic,
      max_participants: opts.maxParticipants ?? null,
      starts_at: opts.startsAt ?? null,
      ends_at: opts.endsAt ?? null,
    })
    .select(BOOK_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Creator-only, enforced by shared_readings_update (creator_id = auth.uid()).
// The book itself isn't editable — only create a new reading for a
// different book.
export async function updateSharedReading(
  readingId: string,
  patch: { isPublic?: boolean; maxParticipants?: number | null; startsAt?: string | null; endsAt?: string | null },
) {
  const { error } = await supabase
    .from('shared_readings')
    .update({
      ...(patch.isPublic !== undefined && { is_public: patch.isPublic }),
      ...(patch.maxParticipants !== undefined && { max_participants: patch.maxParticipants }),
      ...(patch.startsAt !== undefined && { starts_at: patch.startsAt }),
      ...(patch.endsAt !== undefined && { ends_at: patch.endsAt }),
    })
    .eq('id', readingId);
  if (error) throw new Error(error.message);
}

// Creator-only (shared_readings_delete) — cascades to members/messages/
// reactions/theories/proposals/votes/quizzes via ON DELETE CASCADE.
export async function deleteSharedReading(readingId: string) {
  const { error } = await supabase.from('shared_readings').delete().eq('id', readingId);
  if (error) throw new Error(error.message);
}

// Only works for public readings — joining a private one requires the
// creator to add the member directly (see db/migrations/038_shared_readings.sql's
// insert policies), not a self-serve invite flow yet.
export async function joinSharedReading(readingId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_members')
    .insert({ shared_reading_id: readingId, user_id: userId });
  if (error) throw new Error(error.message);

  const [{ data: reading }, { data: me }] = await Promise.all([
    supabase.from('shared_readings').select('creator_id,book:books(title)').eq('id', readingId).maybeSingle(),
    supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
  ]);
  if (reading && reading.creator_id !== userId) {
    notify(reading.creator_id, 'Nouveau participant', `${me?.username ?? 'Quelqu\'un'} a rejoint "${(reading as any).book?.title ?? 'ta lecture commune'}"`);
  }
}

export async function leaveSharedReading(readingId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_members')
    .delete()
    .eq('shared_reading_id', readingId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// Creator-only (shared_reading_members_delete_creator) — moderation: kick a
// disruptive member out of the reading.
export async function removeMember(readingId: string, userId: string) {
  const { error } = await supabase
    .from('shared_reading_members')
    .delete()
    .eq('shared_reading_id', readingId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// Creator-only (shared_reading_members_insert_creator, already RLS-enforced
// server-side since db/migrations/038_shared_readings.sql — just never had a
// UI). The only way back into a *private* reading: joinSharedReading only
// works when is_public is true, so a member who leaves or gets removed from
// a private one has no self-serve way back in otherwise.
export async function addMember(readingId: string, userId: string) {
  const { error } = await supabase
    .from('shared_reading_members')
    .insert({ shared_reading_id: readingId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function isMemberOf(readingId: string): Promise<boolean> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('shared_reading_members')
    .select('user_id')
    .eq('shared_reading_id', readingId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

// Rating of the shared-reading *experience* itself — separate from the
// book's own personal rating (lib/userBooks.ts's updateBook, set on the
// book detail screen). Quarter-point, same as everywhere else ratings show
// up (see components/StarRating.tsx).
export async function rateSharedReading(readingId: string, rating: number) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_members')
    .update({ rating: Math.min(5, Math.max(0, Math.round(rating * 4) / 4)) })
    .eq('shared_reading_id', readingId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// RLS alone decides what comes back: the caller's own theories (any state)
// plus everyone else's *resolved* ones — see
// db/migrations/041_shared_reading_theories.sql. No percent gating, unlike
// messages/reactions, since a prediction has no known point to compare
// progress against.
export async function getTheories(readingId: string): Promise<SharedReadingTheory[]> {
  const { data, error } = await supabase
    .from('shared_reading_theories')
    .select('*,profile:profiles(username,avatar_url)')
    .eq('shared_reading_id', readingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function postTheory(readingId: string, content: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_theories')
    .insert({ shared_reading_id: readingId, user_id: userId, content });
  if (error) throw new Error(error.message);
}

// Self-reported by the author once the book reveals the answer — this is
// what flips a theory from private to visible to the rest of the group.
export async function resolveTheory(theoryId: string, isCorrect: boolean) {
  const { error } = await supabase
    .from('shared_reading_theories')
    .update({ is_correct: isCorrect, resolved_at: new Date().toISOString() })
    .eq('id', theoryId);
  if (error) throw new Error(error.message);
}

// Text Q&A window, not actual video/audio — see
// db/migrations/045_shared_reading_live_and_quiz.sql. Creator-only, enforced
// by the existing shared_readings update policy (creator_id = auth.uid()).
export async function setLive(readingId: string, isLive: boolean) {
  const userId = await requireUserId();
  const { error } = await supabase.from('shared_readings').update({ is_live: isLive }).eq('id', readingId);
  if (error) throw new Error(error.message);
  if (isLive) {
    const { data: reading } = await supabase.from('shared_readings').select('book:books(title)').eq('id', readingId).maybeSingle();
    notifyOtherMembers(readingId, userId, 'C\'est en direct !', `Le direct de "${(reading as any)?.book?.title ?? 'la lecture commune'}" vient de commencer`);
  }
}

export async function createQuiz(readingId: string, question: string, options: string[], correctOption: number) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_quizzes')
    .insert({ shared_reading_id: readingId, created_by: userId, question, options, correct_option: correctOption });
  if (error) throw new Error(error.message);
  notifyOtherMembers(readingId, userId, 'Nouveau quiz', question);
}

export async function getQuizzes(readingId: string): Promise<SharedReadingQuiz[]> {
  const { data, error } = await supabase
    .from('shared_reading_quizzes')
    .select('id,question,options,correct_option,created_at')
    .eq('shared_reading_id', readingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMyQuizAnswer(quizId: string): Promise<number | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('shared_reading_quiz_answers')
    .select('selected_option')
    .eq('quiz_id', quizId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.selected_option ?? null;
}

export async function answerQuiz(quizId: string, selectedOption: number) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_quiz_answers')
    .insert({ quiz_id: quizId, user_id: userId, selected_option: selectedOption });
  if (error) throw new Error(error.message);
}

export async function getQuizResults(quizId: string): Promise<SharedReadingQuizResult[]> {
  const { data, error } = await supabase.rpc('get_shared_reading_quiz_results', { p_quiz_id: quizId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBadges(readingId: string): Promise<SharedReadingBadge[]> {
  const { data, error } = await supabase.rpc('get_shared_reading_badges', { p_reading_id: readingId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function proposeBook(readingId: string, bookId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_book_proposals')
    .insert({ shared_reading_id: readingId, book_id: bookId, proposed_by: userId });
  if (error) throw new Error(error.message);
}

export async function getProposals(readingId: string): Promise<SharedReadingProposal[]> {
  const { data, error } = await supabase.rpc('get_shared_reading_proposals', { p_reading_id: readingId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// One active vote per reading (unique on shared_reading_id, user_id) — a
// re-vote deletes the previous pick and inserts the new one. Routed through
// the vote_for_proposal RPC (db/schema.sql) so that's atomic: two separate
// client round trips used to mean a failed insert could silently wipe the
// previous vote with no way to tell.
export async function voteFor(readingId: string, proposalId: string) {
  const { error } = await supabase.rpc('vote_for_proposal', {
    p_reading_id: readingId,
    p_proposal_id: proposalId,
  });
  if (error) throw new Error(error.message);
}

export async function getRoster(readingId: string): Promise<SharedReadingRosterEntry[]> {
  const { data, error } = await supabase.rpc('get_shared_reading_roster', { p_reading_id: readingId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMessages(readingId: string): Promise<SharedReadingMessage[]> {
  const { data, error } = await supabase.rpc('get_shared_reading_messages', { p_reading_id: readingId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// percentThreshold defaults to the poster's own current progress on the
// reading's book — the common case ("what I'm posting is about where I
// just got to") — callers can still pass an earlier value to tag something
// about a point they've since passed.
export async function postMessage(readingId: string, bookId: string, content: string, percentThreshold?: number) {
  const userId = await requireUserId();
  let threshold = percentThreshold;
  if (threshold === undefined) {
    const { data } = await supabase
      .from('user_books')
      .select('progress_percent')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .maybeSingle();
    threshold = data?.progress_percent ?? 0;
  }
  const { error } = await supabase
    .from('shared_reading_messages')
    .insert({ shared_reading_id: readingId, user_id: userId, content, percent_threshold: threshold, kind: 'book' });
  if (error) throw new Error(error.message);
}

// Plain chit-chat, not tied to a point in the book — always visible to
// every member regardless of their own progress (see db/migrations/
// 057_shared_reading_general_chat.sql), unlike postMessage's spoiler-gated
// book discussion.
export async function postGeneralMessage(readingId: string, content: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shared_reading_messages')
    .insert({ shared_reading_id: readingId, user_id: userId, content, percent_threshold: 0, kind: 'general' });
  if (error) throw new Error(error.message);
}

// Author-only (shared_reading_messages_delete_own).
export async function deleteMessage(messageId: string) {
  const { error } = await supabase.from('shared_reading_messages').delete().eq('id', messageId);
  if (error) throw new Error(error.message);
}

export async function getReactionStats(readingId: string): Promise<SharedReadingReactionStat[]> {
  const { data, error } = await supabase.rpc('get_shared_reading_reaction_stats', { p_reading_id: readingId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Reacts at the caller's own current progress, rounded to the nearest 5%
// bucket (see db/migrations/039_shared_reading_reactions.sql) — reacting
// again later just moves your pick to your new bucket, one row per user.
export async function react(readingId: string, bookId: string, emoji: string) {
  const userId = await requireUserId();
  const { data: ub } = await supabase
    .from('user_books')
    .select('progress_percent')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();
  const percentBucket = Math.round((ub?.progress_percent ?? 0) / 5) * 5;
  const { error } = await supabase
    .from('shared_reading_reactions')
    .upsert(
      { shared_reading_id: readingId, user_id: userId, percent_bucket: percentBucket, emoji },
      { onConflict: 'shared_reading_id,user_id,percent_bucket' },
    );
  if (error) throw new Error(error.message);
}

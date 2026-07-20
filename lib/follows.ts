import { supabase, getCurrentUserId } from './supabase';
import { API_BASE } from './apiUrl';

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

// Fire-and-forget, same as the old Express handler's sendPushNotification —
// a failed/missing token shouldn't block the follow action itself.
function notify(toUserId: string, title: string, body: string) {
  fetch(`${API_BASE}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId, title, body }),
  }).catch(() => {});
}

export async function searchUsers(q: string) {
  const { data, error } = await supabase.rpc('search_users', { p_query: q });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// People I follow.
export async function getFollowing() {
  const { data, error } = await supabase.rpc('list_following');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// People who follow me — each row carries `followed_back` so the UI can
// offer "Suivre en retour" vs. just "Abonné(e)".
export async function getFollowers() {
  const { data, error } = await supabase.rpc('list_followers');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// No acceptance step — this both creates the relationship and is the only
// signal the other person gets (unlike the old request/accept flow, there's
// no separate "accepted" notification).
export async function followUser(userId: string) {
  const me = await requireUserId();
  const { error } = await supabase.from('follows').insert({ follower_id: me, followee_id: userId });
  if (error) throw new Error(error.message);
  notify(userId, 'Nouvel abonné', 'Quelqu’un a commencé à te suivre sur Readigma !');
}

export async function unfollowUser(userId: string) {
  const me = await requireUserId();
  const { error } = await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', userId);
  if (error) throw new Error(error.message);
}

// follows' select policy is open to any signed-in user (see db/schema.sql),
// so this is a plain client-side query rather than an RPC — used to decide
// which button state (Suivre / Abonné(e)) to show on someone's profile.
export async function isFollowing(userId: string) {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', me)
    .eq('followee_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

// Backs both the notification bell badge and notifications.tsx's "Nouveaux
// abonnés" section — there's no request/accept step to count anymore (see
// getPendingRequests in the old lib/friends.ts), and no "seen" tracking to
// build a precise unread count from, so this is a best-effort "who started
// following you recently" instead.
export async function getRecentFollowers(days = 7) {
  const me = await requireUserId();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('follows')
    .select('created_at, follower:profiles!follows_follower_id_fkey(id, username, avatar_url)')
    .eq('followee_id', me)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({ ...row.follower, created_at: row.created_at }));
}

// Lightweight count-only pair (following/followers) for a profile header —
// follows' select policy is open to any signed-in user, so this is a plain
// client-side count query rather than an RPC, same reasoning as isFollowing.
// Defaults to the caller's own counts; pass a userId to get someone else's.
export async function getFollowCounts(userId?: string) {
  const id = userId ?? await requireUserId();
  const [{ count: following, error: e1 }, { count: followers, error: e2 }] = await Promise.all([
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('followee_id', id),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return { following: following ?? 0, followers: followers ?? 0 };
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase.rpc('get_user_profile', { p_user_id: userId });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error('Profil introuvable');
  return {
    user: { username: row.username, avatar_url: row.avatar_url },
    stats: {
      done_count: row.done_count,
      to_read_count: row.to_read_count,
      reading_count: row.reading_count,
      avg_rating: row.avg_rating,
    },
    currentlyReading: row.currently_reading ?? [],
    goal: row.goal_target ? { target: row.goal_target, booksRead: row.goal_books_read ?? 0 } : null,
    formatStats: { physical_count: row.physical_count ?? 0, ereader_count: row.ereader_count ?? 0, audiobook_count: row.audiobook_count ?? 0 },
    readingSeconds: row.reading_seconds ?? 0,
    reviews: row.reviews ?? [],
  };
}

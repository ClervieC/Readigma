import { supabase, getCurrentUserId } from './supabase';
import { API_BASE } from './apiUrl';

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

// Fire-and-forget, same as the old Express handler's sendPushNotification —
// a failed/missing token shouldn't block the friend-request flow itself.
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

export async function getFriends() {
  const { data, error } = await supabase.rpc('list_friends');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPendingRequests() {
  const { data, error } = await supabase.rpc('list_pending_requests');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function sendRequest(receiverId: string) {
  const userId = await requireUserId();
  const { error } = await supabase.from('friendships').insert({ requester_id: userId, receiver_id: receiverId });
  if (error) throw new Error(error.message);
  notify(receiverId, 'Nouvelle demande d’ami', 'Quelqu’un veut te suivre sur Readigma !');
}

export async function acceptRequest(id: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', id)
    .select('requester_id')
    .single();
  if (error) throw new Error(error.message);
  if (data) notify(data.requester_id, 'Demande acceptée', 'Vous êtes maintenant amis lecteurs !');
}

export async function declineRequest(id: string) {
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase.rpc('friend_profile', { p_user_id: userId });
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
  };
}

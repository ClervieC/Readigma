import { supabase, getCurrentUserId } from './supabase';
import { API_BASE } from './apiUrl';

export type ThreadMessage = {
  id: string;
  user_id: string;
  sender: 'user' | 'admin';
  body: string;
  created_at: string;
};

function notify(toUserId: string, title: string, body: string) {
  fetch(`${API_BASE}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId, title, body }),
  }).catch(() => {});
}

// The signed-in user's own conversation with the team (app/contact.tsx).
export async function getMyThread(): Promise<ThreadMessage[]> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { data, error } = await supabase
    .from('admin_thread_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function sendMyMessage(body: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase
    .from('admin_thread_messages')
    .insert({ user_id: userId, sender: 'user', body });
  if (error) throw new Error(error.message);
}

// Admin side (app/admin.tsx "Messages" tab) — every thread, most recently
// active first, one row per distinct user rather than per message so the
// inbox reads like a conversation list instead of a flat message log.
export type ThreadSummary = {
  user_id: string;
  username?: string;
  last_body: string;
  last_sender: 'user' | 'admin';
  last_at: string;
};

export async function getThreadSummaries(): Promise<ThreadSummary[]> {
  const { data, error } = await supabase
    .from('admin_thread_messages')
    .select('*,profile:profiles(username)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const summaries: ThreadSummary[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    summaries.push({
      user_id: row.user_id,
      username: row.profile?.username,
      last_body: row.body,
      last_sender: row.sender,
      last_at: row.created_at,
    });
  }
  return summaries;
}

export async function getThreadFor(userId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('admin_thread_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function sendAdminReply(userId: string, body: string) {
  const { error } = await supabase
    .from('admin_thread_messages')
    .insert({ user_id: userId, sender: 'admin', body });
  if (error) throw new Error(error.message);
  notify(userId, "Réponse de l'équipe Readigma", body);
}

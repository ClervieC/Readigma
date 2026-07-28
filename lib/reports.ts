import { supabase, getCurrentUserId } from './supabase';

export async function submitReport(targetType: 'book' | 'user' | 'shared_reading_message' | 'book_review', targetId: string, reason: string, details?: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase.from('reports').insert({
    reporter_id: userId,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: details?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export type Report = {
  id: string;
  reporter_id: string;
  target_type: 'book' | 'user' | 'shared_reading_message' | 'book_review';
  target_id: string;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed';
  created_at: string;
  reporter_username?: string;
  target_label?: string;
};

// Admin-only (RLS gates the select/update themselves) — see app/admin.tsx's
// "Signalements" tab. target_label is resolved separately per target_type
// since it can point at either books or profiles (no single join covers
// both), fetched in bulk to keep this to two extra queries total rather
// than one per report.
export async function getReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*,reporter:profiles(username)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const bookIds = rows.filter(r => r.target_type === 'book').map(r => r.target_id);
  const userIds = rows.filter(r => r.target_type === 'user').map(r => r.target_id);
  // The reporting user themselves is readable via profiles' select-all
  // policy, but a reported *message* isn't — only its author can normally
  // read it (see shared_reading_messages_select_own), so admins need the
  // dedicated shared_reading_messages_select_admin policy for this join to
  // return anything at all.
  const messageIds = rows.filter(r => r.target_type === 'shared_reading_message').map(r => r.target_id);
  const [booksRes, usersRes, messagesRes] = await Promise.all([
    bookIds.length ? supabase.from('books').select('id,title').in('id', bookIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? supabase.from('profiles').select('id,username').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    messageIds.length ? supabase.from('shared_reading_messages').select('id,content').in('id', messageIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const bookTitles = new Map((booksRes.data ?? []).map((b: any) => [b.id, b.title]));
  const usernames = new Map((usersRes.data ?? []).map((u: any) => [u.id, u.username]));
  const messageContents = new Map((messagesRes.data ?? []).map((m: any) => [m.id, m.content]));

  return rows.map((r: any) => ({
    ...r,
    reporter_username: r.reporter?.username,
    target_label:
      r.target_type === 'book' ? bookTitles.get(r.target_id)
      : r.target_type === 'user' ? usernames.get(r.target_id)
      : messageContents.get(r.target_id),
  }));
}

export async function markReportReviewed(id: string) {
  const { error } = await supabase.from('reports').update({ status: 'reviewed' }).eq('id', id);
  if (error) throw new Error(error.message);
}

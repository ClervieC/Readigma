import { supabase, getCurrentUserId } from './supabase';

export async function submitReport(targetType: 'book' | 'user', targetId: string, reason: string, details?: string) {
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
  target_type: 'book' | 'user';
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
  const [booksRes, usersRes] = await Promise.all([
    bookIds.length ? supabase.from('books').select('id,title').in('id', bookIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? supabase.from('profiles').select('id,username').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const bookTitles = new Map((booksRes.data ?? []).map((b: any) => [b.id, b.title]));
  const usernames = new Map((usersRes.data ?? []).map((u: any) => [u.id, u.username]));

  return rows.map((r: any) => ({
    ...r,
    reporter_username: r.reporter?.username,
    target_label: r.target_type === 'book' ? bookTitles.get(r.target_id) : usernames.get(r.target_id),
  }));
}

export async function markReportReviewed(id: string) {
  const { error } = await supabase.from('reports').update({ status: 'reviewed' }).eq('id', id);
  if (error) throw new Error(error.message);
}

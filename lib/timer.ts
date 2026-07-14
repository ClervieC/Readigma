import { supabase, getCurrentUserId } from './supabase';

export type ReadingSession = {
  id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
};

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

// At most one session is ever "running" (ended_at null) per user across all
// books — startSession() stops any other running one first, so a book's
// timer card only ever needs to check whether this session belongs to it.
export async function getActiveSession(): Promise<ReadingSession | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('reading_sessions')
    .select('id,book_id,started_at,ended_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function startSession(bookId: string): Promise<ReadingSession> {
  const userId = await requireUserId();
  const active = await getActiveSession();
  if (active) await stopSession(active.id);
  const { data, error } = await supabase
    .from('reading_sessions')
    .insert({ user_id: userId, book_id: bookId })
    .select('id,book_id,started_at,ended_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function stopSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('reading_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function getBookReadingTime(bookId: string): Promise<number> {
  const { data, error } = await supabase.rpc('book_reading_time', { p_book_id: bookId });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function getReadingTimeStats(): Promise<{ total_seconds: number; month_seconds: number }> {
  const { data, error } = await supabase.rpc('reading_time_stats');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { total_seconds: row?.total_seconds ?? 0, month_seconds: row?.month_seconds ?? 0 };
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

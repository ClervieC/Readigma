import { supabase, getCurrentUserId } from './supabase';
import { API_BASE } from './apiUrl';

// Fire-and-forget, same pattern as lib/friends.ts's notify() — a missing/
// stale push token shouldn't block the moderation action itself.
function notify(toUserId: string, title: string, body: string) {
  fetch(`${API_BASE}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId, title, body }),
  }).catch(() => {});
}

export type AdminMessage = {
  id: string;
  user_id: string;
  message: string;
  status: 'unread' | 'read';
  created_at: string;
  username?: string;
};

export type BookSuggestion = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  username?: string;
};

// Used by app/help.tsx's contact form — replaces the old mailto: link with a
// real inbox an admin account can read (see admin_messages RLS in schema.sql).
export async function sendAdminMessage(message: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase.from('admin_messages').insert({ user_id: userId, message });
  if (error) throw new Error(error.message);
}

// The rest of this module is admin-only — RLS on both tables restricts
// select/update to profiles.role = 'admin', so these simply fail with a
// permission error for anyone else; app/admin.tsx also gates the route
// itself on profile.role client-side so a non-admin never sees the screen.
export async function getMessages(): Promise<AdminMessage[]> {
  const { data, error } = await supabase
    .from('admin_messages')
    .select('*,profile:profiles(username)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, username: r.profile?.username }));
}

export async function markMessageRead(id: string) {
  const { error } = await supabase.from('admin_messages').update({ status: 'read' }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getSuggestions(): Promise<BookSuggestion[]> {
  const { data, error } = await supabase
    .from('book_suggestions')
    .select('*,profile:profiles(username)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, username: r.profile?.username }));
}

export async function updateSuggestionStatus(id: string, status: 'approved' | 'rejected') {
  const { data, error } = await supabase
    .from('book_suggestions')
    .update({ status })
    .eq('id', id)
    .select('user_id,title')
    .single();
  if (error) throw new Error(error.message);
  if (data) {
    notify(
      data.user_id,
      status === 'approved' ? 'Suggestion approuvée' : 'Suggestion refusée',
      status === 'approved'
        ? `"${data.title}" a été ajouté au catalogue Readigma !`
        : `Ta suggestion "${data.title}" n'a pas été retenue cette fois.`
    );
  }
}

export type ManualBook = {
  title: string;
  author: string;
  cover_url: string;
  description: string;
  genres: string; // comma-separated in the form, split before insert
  published_year: string;
  series: string;
  series_index: string;
};

// Suggestions only carry title/author/message (see book_suggestions schema) —
// the admin fills in everything else (cover, description, genres, year,
// series) by hand before it becomes a real catalog entry, same shape as a
// search result going through books.addBookToDb, but with no external
// source to normalize from.
export async function addBookManually(book: ManualBook) {
  const externalId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.from('books').insert({
    external_id: externalId,
    title: book.title.trim(),
    author: book.author.trim() || null,
    cover_url: book.cover_url.trim() || null,
    description: book.description.trim() || null,
    genres: book.genres.split(',').map(g => g.trim()).filter(Boolean),
    published_year: book.published_year.trim() ? parseInt(book.published_year, 10) : null,
    series: book.series.trim() || null,
    series_index: book.series_index.trim() ? parseFloat(book.series_index) : null,
    approved: true,
  });
  if (error) throw new Error(error.message);
}

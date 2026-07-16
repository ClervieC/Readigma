import { supabase, getCurrentUserId } from './supabase';
import { API_BASE } from './apiUrl';
import { BookFormFields, EMPTY_BOOK_FORM } from '../components/BookForm';

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
  status: 'unread' | 'read' | 'replied';
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  username?: string;
};

// Mirrors BookFormFields exactly (see book_suggestions in db/schema.sql) — a
// suggestion carries everything needed to add the book to the catalog
// directly, so the admin reviews and confirms rather than re-typing it.
export type BookSuggestion = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  message: string | null;
  cover_url: string | null;
  description: string | null;
  genres: string[];
  published_year: number | null;
  series: string | null;
  series_index: number | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  username?: string;
};

export function suggestionToForm(s: BookSuggestion): BookFormFields {
  return {
    ...EMPTY_BOOK_FORM,
    title: s.title,
    author: s.author ?? '',
    cover_url: s.cover_url ?? '',
    description: s.description ?? '',
    genres: (s.genres ?? []).join(', '),
    published_year: s.published_year != null ? String(s.published_year) : '',
    series: s.series ?? '',
    series_index: s.series_index != null ? String(s.series_index) : '',
  };
}

// Used by app/help.tsx's contact form — replaces the old mailto: link with a
// real inbox an admin account can read (see admin_messages RLS in schema.sql).
export async function sendAdminMessage(message: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase.from('admin_messages').insert({ user_id: userId, message });
  if (error) throw new Error(error.message);
}

// The rest of this module is admin-only — RLS restricts the writes (profiles
// update, book_suggestions update) to profiles.role = 'admin', so these
// simply fail with a permission error for anyone else; app/admin.tsx also
// gates the route itself on profile.role client-side so a non-admin never
// sees the screen.
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

export async function replyToMessage(id: string, reply: string) {
  const { data, error } = await supabase
    .from('admin_messages')
    .update({ status: 'replied', reply, replied_at: new Date().toISOString() })
    .eq('id', id)
    .select('user_id')
    .single();
  if (error) throw new Error(error.message);
  if (data) notify(data.user_id, "Réponse de l'équipe Readigma", reply);
}

export async function getSuggestions(): Promise<BookSuggestion[]> {
  const { data, error } = await supabase
    .from('book_suggestions')
    .select('*,profile:profiles(username)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, username: r.profile?.username }));
}

async function markSuggestionDecided(id: string, status: 'approved' | 'rejected') {
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

// One-click path: adds the book to the catalog using exactly what was
// suggested, then marks it approved. See app/admin.tsx's "Modifier" action
// for the alternative path (tweak fields first, then save from the "Ajouter
// un livre" tab, which calls markSuggestionApproved below instead).
export async function approveSuggestion(s: BookSuggestion) {
  await addBookManually(suggestionToForm(s));
  await markSuggestionDecided(s.id, 'approved');
}

export async function rejectSuggestion(s: BookSuggestion) {
  await markSuggestionDecided(s.id, 'rejected');
}

// Used after an admin edits a suggestion's fields in the "Ajouter un livre"
// tab and saves it themselves (saveBook already inserted the book, so this
// only flips the suggestion's status/notifies — no second insert).
export async function markSuggestionApproved(id: string) {
  await markSuggestionDecided(id, 'approved');
}

export type AdminUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  role: string;
  banned: boolean;
  created_at: string;
};

// profiles is world-readable by design (friend search, feed authorship — see
// profiles_select_all in schema.sql), so this needs no special RPC; only the
// write side (setUserRole/setUserBanned below) is actually admin-gated, by
// profiles_update_admin + the prevent_role_self_escalation trigger.
export async function getAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setUserBanned(id: string, banned: boolean) {
  const { error } = await supabase.from('profiles').update({ banned }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setUserRole(id: string, role: 'user' | 'admin') {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addBookManually(book: BookFormFields) {
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

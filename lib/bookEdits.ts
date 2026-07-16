import { supabase, getCurrentUserId } from './supabase';

export type BookEditFields = {
  description: string;
  genres: string; // comma-separated in the form, split before insert
  cover_url: string;
  isbn: string;
  published_year: string;
  series: string;
  series_index: string;
};

export const EMPTY_BOOK_EDIT: BookEditFields = {
  description: '', genres: '', cover_url: '', isbn: '', published_year: '', series: '', series_index: '',
};

export async function submitBookEdit(bookId: string, fields: BookEditFields) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase.from('book_edit_suggestions').insert({
    user_id: userId,
    book_id: bookId,
    description: fields.description.trim() || null,
    genres: fields.genres.trim() ? fields.genres.split(',').map(g => g.trim()).filter(Boolean) : null,
    cover_url: fields.cover_url.trim() || null,
    isbn: fields.isbn.trim() || null,
    published_year: fields.published_year.trim() ? parseInt(fields.published_year, 10) : null,
    series: fields.series.trim() || null,
    series_index: fields.series_index.trim() ? parseFloat(fields.series_index) : null,
  });
  if (error) throw new Error(error.message);
}

export type BookEditSuggestion = {
  id: string;
  user_id: string;
  book_id: string;
  description: string | null;
  genres: string[] | null;
  cover_url: string | null;
  isbn: string | null;
  published_year: number | null;
  series: string | null;
  series_index: number | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  username?: string;
  book_title?: string;
};

// Admin-only (RLS gates the select/update themselves) — see app/admin.tsx's
// "Modifications" tab.
export async function getBookEdits(): Promise<BookEditSuggestion[]> {
  const { data, error } = await supabase
    .from('book_edit_suggestions')
    .select('*,profile:profiles(username),book:books(title)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...r, username: r.profile?.username, book_title: r.book?.title }));
}

// Applies whatever fields were proposed onto the actual book row — only the
// non-null ones, so a suggestion that only filled in a summary doesn't wipe
// out the book's existing genres/series/etc.
export async function approveBookEdit(s: BookEditSuggestion) {
  const patch: Record<string, any> = {};
  if (s.description != null) patch.description = s.description;
  if (s.genres != null) patch.genres = s.genres;
  if (s.cover_url != null) patch.cover_url = s.cover_url;
  if (s.isbn != null) patch.isbn = s.isbn;
  if (s.published_year != null) patch.published_year = s.published_year;
  if (s.series != null) patch.series = s.series;
  if (s.series_index != null) patch.series_index = s.series_index;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('books').update(patch).eq('id', s.book_id);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from('book_edit_suggestions').update({ status: 'approved' }).eq('id', s.id);
  if (error) throw new Error(error.message);
}

export async function rejectBookEdit(id: string) {
  const { error } = await supabase.from('book_edit_suggestions').update({ status: 'rejected' }).eq('id', id);
  if (error) throw new Error(error.message);
}

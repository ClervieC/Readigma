import { supabase, getCurrentUserId } from './supabase';

export type UserBook = {
  book_id: string;
  status: 'to_read' | 'reading' | 'done' | 'dnf';
  format: 'physical' | 'ereader' | null;
  rating: number | null;
  comment: string | null;
  current_page: number;
  total_pages: number;
  progress_percent: number;
  started_at: string | null;
  finished_at: string | null;
  title: string;
  author: string;
  cover_url: string | null;
  description: string | null;
  genres: string[];
  tropes: string[];
  published_year: number | null;
};

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

function flatten(row: any): UserBook {
  const { book, ...rest } = row;
  return { ...rest, ...book };
}

export async function getMyBooks(status?: string): Promise<UserBook[]> {
  const userId = await requireUserId();
  let q = supabase
    .from('user_books')
    .select('*,book:books(title,author,cover_url,description,genres,tropes,published_year)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(flatten);
}

export async function addBook(bookId: string, status = 'to_read') {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('user_books')
    .upsert({ user_id: userId, book_id: bookId, status }, { onConflict: 'user_id,book_id' });
  if (error) throw new Error(error.message);
}

export async function updateBook(
  bookId: string,
  patch: { status?: string; rating?: number; comment?: string; format?: 'physical' | 'ereader' }
) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_books')
    .update(patch)
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  if (patch.status === 'done') {
    await supabase.from('activity_feed').insert({
      user_id: userId,
      book_id: bookId,
      activity_type: 'finished',
      metadata: { rating: patch.rating, comment: patch.comment },
    });
  }
  return data;
}

export async function removeBook(bookId: string) {
  const userId = await requireUserId();
  const { error } = await supabase.from('user_books').delete().eq('user_id', userId).eq('book_id', bookId);
  if (error) throw new Error(error.message);
}

export async function updateProgress(
  bookId: string,
  patch: { current_page?: number; total_pages?: number; progress_percent?: number }
) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_books')
    .update(patch)
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .select('progress_percent')
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('activity_feed').insert({
    user_id: userId,
    book_id: bookId,
    activity_type: 'progress_update',
    metadata: { percent: data?.progress_percent, current_page: patch.current_page },
  });
  return data;
}

export async function addReaction(
  bookId: string,
  input: { emoji: string; note?: string; progress_percent?: number; page_number?: number; is_public?: boolean }
) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('reading_reactions')
    .insert({ user_id: userId, book_id: bookId, ...input })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  if (input.is_public !== false) {
    await supabase.from('activity_feed').insert({
      user_id: userId,
      book_id: bookId,
      activity_type: 'reaction',
      reaction_id: data.id,
    });
  }
  return data;
}

// Backs app/book/[id].tsx: that route only ever gets a bare book_id via
// navigation (Expo Router params are plain strings, unlike React Navigation's
// object params the old app relied on), so it self-loads both the public
// book metadata and the viewer's own user_books row for it, if any — a
// feed item can point at a book the viewer hasn't added to their own
// library yet, in which case status/rating/progress just come back as
// defaults and the screen offers to add it, same as before.
export async function getBookDetail(bookId: string) {
  const userId = await requireUserId();
  const [{ data: book, error: bookErr }, { data: userBook, error: ubErr }] = await Promise.all([
    supabase.from('books').select('*').eq('id', bookId).single(),
    supabase.from('user_books').select('*').eq('user_id', userId).eq('book_id', bookId).maybeSingle(),
  ]);
  if (bookErr) throw new Error(bookErr.message);
  if (ubErr) throw new Error(ubErr.message);
  return {
    book_id: bookId,
    title: book?.title,
    author: book?.author,
    cover_url: book?.cover_url,
    description: book?.description,
    genres: book?.genres ?? [],
    tropes: book?.tropes ?? [],
    published_year: book?.published_year,
    status: userBook?.status,
    format: userBook?.format ?? null,
    rating: userBook?.rating,
    comment: userBook?.comment,
    current_page: userBook?.current_page ?? 0,
    total_pages: userBook?.total_pages ?? 0,
    progress_percent: userBook?.progress_percent ?? 0,
  };
}

export async function getFormatStats(): Promise<{ physical_count: number; ereader_count: number }> {
  const { data, error } = await supabase.rpc('format_stats');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { physical_count: row?.physical_count ?? 0, ereader_count: row?.ereader_count ?? 0 };
}

export async function getReactions(bookId: string) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('reading_reactions')
    .select('*')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .order('progress_percent', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

import { supabase, getCurrentUserId } from './supabase';

export type UserBook = {
  book_id: string;
  external_id: string;
  status: 'to_read' | 'reading' | 'done' | 'dnf';
  format: 'physical' | 'ereader' | null;
  rating: number | null;
  comment: string | null;
  current_page: number;
  total_pages: number;
  progress_percent: number;
  progress_mode: 'pages' | 'percent';
  started_at: string | null;
  finished_at: string | null;
  shelf_position: number | null;
  pile_id: string | null;
  manual_tilt: number | null;
  shelf_break_before: boolean | null;
  created_at: string;
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
    .select('*,book:books(external_id,title,author,cover_url,description,genres,tropes,published_year)')
    .eq('user_id', userId)
    // Manually placed books (see saveShelfOrder, app/(tabs)/library.tsx's
    // reorder mode) come first in their saved order; anything never
    // manually placed falls back to date added.
    .order('shelf_position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(flatten);
}

// Persists a manual drag/tap reorder for one status list — see
// app/(tabs)/library.tsx's reorder mode. Assigns sequential positions
// (0, 1, 2...) to the given book ids in the order provided; called with the
// *entire* status list every time (not just the two swapped), since a
// partial write would otherwise leave stale positions from a previous order.
export async function saveShelfOrder(orderedBookIds: string[]) {
  const userId = await requireUserId();
  // One batched upsert instead of one PATCH per book — with a large library,
  // firing dozens of parallel requests here was hitting the browser's
  // connection limit (net::ERR_INSUFFICIENT_RESOURCES) and made every drop
  // feel slow/inconsistent. merge-duplicates only touches shelf_position on
  // conflict, it doesn't null out the rest of the row.
  const rows = orderedBookIds.map((bookId, index) => ({
    user_id: userId,
    book_id: bookId,
    shelf_position: index,
  }));
  const { error } = await supabase
    .from('user_books')
    .upsert(rows, { onConflict: 'user_id,book_id' });
  if (error) throw new Error(error.message);
}

// Piles bookId onto targetBookId's stack (or starts a new one if targetBookId
// wasn't already in one) — see app/(tabs)/library.tsx's reorder mode. Books
// sharing a pile_id render as one manual lying-flat stack instead of the
// automatic pseudo-random grouping.
export async function stackBooks(bookId: string, targetBookId: string, existingPileId: string | null) {
  const userId = await requireUserId();
  const pileId = existingPileId ?? targetBookId;
  await Promise.all([
    supabase.from('user_books').update({ pile_id: pileId }).eq('user_id', userId).eq('book_id', bookId),
    existingPileId
      ? Promise.resolve()
      : supabase.from('user_books').update({ pile_id: pileId }).eq('user_id', userId).eq('book_id', targetBookId),
  ]);
}

// Pulls one book back out of its manual pile, standing it upright again.
export async function unstackBook(bookId: string) {
  const userId = await requireUserId();
  const { error } = await supabase.from('user_books').update({ pile_id: null }).eq('user_id', userId).eq('book_id', bookId);
  if (error) throw new Error(error.message);
}

// null cycles back to the automatic (hashed) angle — see spineTilt in
// app/(tabs)/library.tsx.
export async function setManualTilt(bookId: string, tilt: -1 | 0 | 1 | null) {
  const userId = await requireUserId();
  const { error } = await supabase.from('user_books').update({ manual_tilt: tilt }).eq('user_id', userId).eq('book_id', bookId);
  if (error) throw new Error(error.message);
}

// Marks/clears bookId as the anchor of an empty shelf inserted just before
// its row — see the "+" divider between shelf rows in reorder mode
// (app/(tabs)/library.tsx). Dropping a book into that empty shelf clears the
// flag on the old anchor since the shelf isn't empty anymore.
export async function setShelfBreak(bookId: string, value: boolean | null) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('user_books')
    .update({ shelf_break_before: value })
    .eq('user_id', userId)
    .eq('book_id', bookId);
  if (error) throw new Error(error.message);
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
  patch: { status?: string; rating?: number; comment?: string; format?: 'physical' | 'ereader'; progress_mode?: 'pages' | 'percent' }
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
    external_id: book?.external_id,
    title: book?.title,
    author: book?.author,
    cover_url: book?.cover_url,
    description: book?.description,
    genres: book?.genres ?? [],
    tropes: book?.tropes ?? [],
    published_year: book?.published_year,
    series: book?.series ?? null,
    series_index: book?.series_index ?? null,
    status: userBook?.status,
    format: userBook?.format ?? null,
    rating: userBook?.rating,
    comment: userBook?.comment,
    current_page: userBook?.current_page ?? 0,
    total_pages: userBook?.total_pages ?? 0,
    progress_percent: userBook?.progress_percent ?? 0,
    progress_mode: userBook?.progress_mode ?? 'pages',
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

// Community rating average + individual reviews for a book — crosses user
// boundaries (any reader who finished the book, not just the caller), so
// this goes through security-definer RPCs rather than a direct table read,
// same pattern as friend_profile()/popular_books().
export async function getBookRatingStats(bookId: string): Promise<{ avg_rating: number | null; ratings_count: number }> {
  const { data, error } = await supabase.rpc('book_rating_stats', { p_book_id: bookId });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { avg_rating: row?.avg_rating ?? null, ratings_count: row?.ratings_count ?? 0 };
}

export async function getBookReviews(bookId: string): Promise<{
  username: string; avatar_url: string | null; rating: number | null; comment: string | null; finished_at: string | null;
}[]> {
  const { data, error } = await supabase.rpc('book_reviews', { p_book_id: bookId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

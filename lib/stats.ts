import { supabase } from './supabase';

export type ReadingStatsOverview = {
  total_done: number;
  books_this_month: number;
  books_this_year: number;
  avg_days_to_finish: number | null;
  avg_reading_seconds_per_book: number | null;
  favorite_author: string | null;
  favorite_author_count: number;
  avg_rating: number | null;
};

export async function getOverview(): Promise<ReadingStatsOverview> {
  const { data, error } = await supabase.rpc('reading_stats_overview');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    total_done: row?.total_done ?? 0,
    books_this_month: row?.books_this_month ?? 0,
    books_this_year: row?.books_this_year ?? 0,
    avg_days_to_finish: row?.avg_days_to_finish ?? null,
    avg_reading_seconds_per_book: row?.avg_reading_seconds_per_book ?? null,
    favorite_author: row?.favorite_author ?? null,
    favorite_author_count: row?.favorite_author_count ?? 0,
    avg_rating: row?.avg_rating ?? null,
  };
}

export type GenreCount = { genre: string; count: number };

export async function getGenreBreakdown(): Promise<GenreCount[]> {
  const { data, error } = await supabase.rpc('reading_stats_genres');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStreak(): Promise<number> {
  const { data, error } = await supabase.rpc('reading_streak');
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export type WeekdaySeconds = { weekday: number; seconds: number };

export async function getByWeekday(): Promise<WeekdaySeconds[]> {
  const { data, error } = await supabase.rpc('reading_stats_by_weekday');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ReadingExtremes = {
  longest_book_id: string | null;
  longest_title: string | null;
  longest_days: number | null;
  fastest_book_id: string | null;
  fastest_title: string | null;
  fastest_days: number | null;
};

export async function getExtremes(): Promise<ReadingExtremes> {
  const { data, error } = await supabase.rpc('reading_stats_extremes');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    longest_book_id: row?.longest_book_id ?? null,
    longest_title: row?.longest_title ?? null,
    longest_days: row?.longest_days ?? null,
    fastest_book_id: row?.fastest_book_id ?? null,
    fastest_title: row?.fastest_title ?? null,
    fastest_days: row?.fastest_days ?? null,
  };
}

export async function getFollowingAvg(): Promise<{ following_count: number; avg_books: number | null }> {
  const { data, error } = await supabase.rpc('following_avg_books_this_year');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { following_count: row?.following_count ?? 0, avg_books: row?.avg_books ?? null };
}

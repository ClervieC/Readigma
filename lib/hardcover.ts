import type { NormalizedBook } from './books';
import { API_BASE } from './apiUrl';

// Routed through app/api/hardcover-search+api.ts and hardcover-trending+api.ts
// rather than called directly — Hardcover's API blocks the browser's CORS
// preflight (OPTIONS) on web, and this keeps HARDCOVER_API_TOKEN a real
// server-only secret. See those routes' own comments for the CORS detail.
// Every function here degrades to an empty array (never throws) whenever
// the token is missing server-side or a request fails, so callers can treat
// Hardcover as "try first, fall back to the existing multi-source search"
// without any special-casing.

// cached_tags is grouped by tag category (e.g. { Genre: [...], Mood: [...],
// Tone: [...] }) — same shape/defensiveness as hardcover-lookup+api.ts's
// identical parsing, kept in sync since search hits carry their own genres
// array but the plain `books` query (used by getHardcoverTrending) doesn't.
function genresFromCachedTags(cachedTags: any): string[] {
  const genreTags = cachedTags?.Genre;
  if (!Array.isArray(genreTags)) return [];
  return genreTags
    .map((t: any) => (typeof t === 'string' ? t : t?.tag))
    .filter(Boolean)
    .slice(0, 5);
}

// A search hit's `document` — the shape Hardcover's Typesense-backed index
// returns, distinct from the plain `books` GraphQL type (see
// bookRowToNormalized below).
function searchDocToNormalized(doc: any): NormalizedBook | null {
  if (!doc?.title || !doc?.id) return null;
  return {
    external_id: `hardcover_${doc.id}`,
    title: doc.title,
    author: doc.author_names?.[0] ?? null,
    cover_url: doc.image?.url ?? null,
    description: doc.description ?? null,
    published_year: doc.release_year ?? null,
    genres: Array.isArray(doc.genres) ? doc.genres.slice(0, 5) : [],
    series: doc.series_names?.[0] ?? null,
    isbn: doc.isbns?.[0] ?? null,
  };
}

function bookRowToNormalized(row: any): NormalizedBook {
  return {
    external_id: `hardcover_${row.id}`,
    title: row.title,
    author: row.contributions?.[0]?.author?.name ?? null,
    cover_url: row.image?.url ?? null,
    description: row.description ?? null,
    published_year: row.release_year ?? null,
    genres: genresFromCachedTags(row.cached_tags),
  };
}

// Junk/duplicate stub entries (alternate editions with almost no data) show
// up ranked below the real hit — worth filtering rather than showing a
// title-only row with no cover or author in a results list.
const hasEnoughData = (b: NormalizedBook) => !!(b.cover_url || b.author);

async function runHardcoverSearch(
  body: { query: string; limit: number; filterBy?: string; sort?: string },
): Promise<NormalizedBook[]> {
  try {
    const res = await fetch(`${API_BASE}/api/hardcover-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const docs = json.results;
    if (!Array.isArray(docs)) return [];
    return docs
      .map(searchDocToNormalized)
      .filter((b): b is NormalizedBook => !!b && hasEnoughData(b));
  } catch {
    return [];
  }
}

export async function searchHardcover(query: string, limit = 20): Promise<NormalizedBook[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return runHardcoverSearch({ query: trimmed, limit });
}

export type HardcoverTrendingDuration = 'week' | 'month' | 'three_month' | 'one_year' | 'all';

export async function getHardcoverTrending(
  duration: HardcoverTrendingDuration,
  limit = 12,
): Promise<NormalizedBook[]> {
  try {
    const res = await fetch(`${API_BASE}/api/hardcover-trending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration, limit }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = json.books;
    if (!Array.isArray(rows)) return [];
    return rows.map(bookRowToNormalized).filter(hasEnoughData);
  } catch {
    return [];
  }
}

// Used for "recommendations": a live keyword search scoped to the reader's
// own top genres, same idea as the Open Library subject search it
// supplements/replaces, just backed by Hardcover's richer index. Unlike
// getHardcoverGenrePopular below, this is a genuine free-text query (the
// reader's own genre strings aren't reliably one of Hardcover's exact facet
// values), so it's still ranked by search relevance, not popularity.
export async function searchHardcoverByGenre(genre: string, limit = 12): Promise<NormalizedBook[]> {
  return searchHardcover(genre, limit);
}

// Most-popular-within-a-genre, for search.tsx's genre trending shelves
// (fantasy/thriller/romance/sci-fi). A bare keyword search for e.g.
// "romance" ranks books *titled* "Romance" above actual romance novels —
// verified live, `searchHardcover('romance')` surfaces three different
// books literally called "Romance" before anything genre-appropriate. This
// instead uses Typesense's `filter_by` against the indexed `genres` facet
// (exact match, so `genre` must be one of Hardcover's own display names —
// "Fantasy", "Thriller", "Romance", "Science Fiction", verified against the
// live tags table) with `query: "*"` (match everything) and `sort` on
// `users_count` so results are genuinely the most-read books in that genre,
// not a relevance-ranked keyword hit.
export async function getHardcoverGenrePopular(genre: string, limit = 12): Promise<NormalizedBook[]> {
  return runHardcoverSearch({
    query: '*',
    limit,
    filterBy: `genres:=[${genre}]`,
    sort: 'users_count:desc',
  });
}

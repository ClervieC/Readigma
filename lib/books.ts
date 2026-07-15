import { XMLParser } from 'fast-xml-parser';
import { supabase } from './supabase';

// Open Library's API needs no key and sends `Access-Control-Allow-Origin: *`,
// so — unlike a provider with a secret key — this can be called straight
// from the client (web + native) with no server proxy at all.
const OL_SEARCH_URL = 'https://openlibrary.org/search.json';
const OL_SUBJECT_URL = 'https://openlibrary.org/subjects';
const OL_WORKS_URL = 'https://openlibrary.org/works';
const OL_COVERS_URL = 'https://covers.openlibrary.org/b/id';

// BnF results are prefixed `bnf_` so they never collide with Open Library's
// `OL...W` ids in the shared `books.external_id` column, and so
// getWorkExtras/getWorkDescription (Open-Library-only endpoints) know to
// skip them below.
const isOpenLibraryId = (externalId: string) => /^OL\d+W$/.test(externalId);

export type NormalizedBook = {
  external_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  published_year: number | null;
  genres: string[];
  series?: string | null;
};

// Open Library tags some (not all — coverage is sparse) search docs with a
// `series:Some_Series_Name` entry in their subject list, e.g.
// "series:Harry_Potter". Best-effort auto-fill for the book detail screen's
// series field; frequently absent, so it's editable there too rather than
// relied on alone.
function extractSeries(subjects: string[] | undefined): string | null {
  const tag = subjects?.find((s) => s.toLowerCase().startsWith('series:'));
  return tag ? tag.slice('series:'.length).replace(/_/g, ' ').trim() : null;
}

// Some Open Library "subject" entries are themselves comma-joined phrases
// (e.g. a single subject literally reading "Fiction, thrillers, psychological")
// rather than one tag per entry — stored as-is on `books.genres`, so any
// screen rendering that array raw ends up showing overlapping, comma-stuffed
// chips. This splits every entry on its commas and dedupes before display.
export function normalizeTags(genres: string[] = [], limit = 4): string[] {
  const flat = genres.flatMap(g => g.split(',').map(s => s.trim())).filter(Boolean);
  return Array.from(new Set(flat)).slice(0, limit);
}

function workKeyToId(key: string) {
  // "/works/OL893415W" -> "OL893415W"
  return key.split('/').pop() ?? key;
}

function coverUrl(coverId: number | undefined | null) {
  return coverId ? `${OL_COVERS_URL}/${coverId}-M.jpg` : null;
}

// Search docs frequently lack `cover_i` even when the edition has a real
// cover on file — Open Library also serves covers keyed by ISBN directly,
// so falling back to the doc's first ISBN recovers a lot of otherwise-blank
// covers for free (no extra request; it's a predictable image URL).
function isbnCoverUrl(isbn: string | undefined | null) {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : null;
}

async function searchByQuery(q: string, opts: { sort?: string } = {}): Promise<NormalizedBook[]> {
  const params = new URLSearchParams({
    q,
    limit: '40',
    fields: 'key,title,author_name,cover_i,first_publish_year,subject,isbn',
  });
  if (opts.sort) params.set('sort', opts.sort);
  const res = await fetch(`${OL_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) throw new Error('Erreur de recherche');
  const json = await res.json();
  return (json.docs ?? []).map((doc: any): NormalizedBook => ({
    external_id: workKeyToId(doc.key),
    title: doc.title ?? 'Sans titre',
    author: doc.author_name?.join(', ') ?? null,
    cover_url: coverUrl(doc.cover_i) ?? isbnCoverUrl(doc.isbn?.[0]),
    description: null, // not returned by search — fetched lazily, see getWorkDescription
    published_year: doc.first_publish_year ?? null,
    genres: doc.subject?.slice(0, 5) ?? [],
    series: extractSeries(doc.subject),
  }));
}

// BnF (Bibliothèque nationale de France) receives every book published in
// France by legal deposit, so it finds French authors/small-press titles
// Open Library often misses entirely (verified live: an indie French author
// search turned up 22 BnF records vs. 1 on Open Library). Its SRU catalog
// API is CORS-open and needs no key, but only returns XML (Dublin Core) —
// hence fast-xml-parser, since RN's JS engine has no native DOMParser the
// way a browser does. `not (bib.doctype any "g h v")` excludes sound/image/
// video records, matching BnF's own documented example query.
const BNF_SRU_URL = 'http://catalogue.bnf.fr/api/SRU';
const BNF_COVER_URL = 'https://openapi.bnf.fr/couverture/image/image/recupererImage';
const xmlParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
const toArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v: any): string | null => (typeof v === 'string' ? v : typeof v === 'object' ? v?.['#text'] ?? null : v != null ? String(v) : null);

async function fetchBnf(query: string, maximumRecords: number): Promise<NormalizedBook[]> {
  const params = new URLSearchParams({ version: '1.2', operation: 'searchRetrieve', query, maximumRecords: String(maximumRecords), recordSchema: 'dublincore' });
  try {
    const res = await fetch(`${BNF_SRU_URL}?${params.toString()}`);
    if (!res.ok) return [];
    const xml = await res.text();
    const json = xmlParser.parse(xml);
    const records = toArray(json?.searchRetrieveResponse?.records?.record);
    const seen = new Set<string>();
    const results: NormalizedBook[] = [];
    for (const record of records) {
      const dc = record?.recordData?.dc;
      if (!dc) continue;
      // BnF catalogs periodicals/serials under the same subject+doctype
      // query as novels (e.g. a magazine collection) — dc:type is what
      // actually distinguishes them ("publication en série imprimée" vs.
      // "texte imprimé"), unlike title, where the giveaway venue/year is
      // sometimes on the title and sometimes on the publisher instead.
      const types = toArray(dc.type).map(textOf).join(' ');
      if (types.includes('série') || types.includes('serial')) continue;
      const title = textOf(toArray(dc.title)[0]);
      if (!title) continue;
      const author = toArray(dc.creator).map(textOf).filter(Boolean).join(', ') || null;
      const dedupeKey = `${title}|${author}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const identifier = textOf(toArray(dc.identifier)[0]) ?? '';
      const arkMatch = identifier.match(/ark:\/\d+\/\w+/);
      const ark = arkMatch?.[0];
      const dateStr = textOf(toArray(dc.date)[0]);
      const yearMatch = dateStr?.match(/\d{4}/);
      results.push({
        external_id: ark ? `bnf_${ark.split('/').pop()}` : `bnf_${title}`,
        title,
        author,
        cover_url: ark ? `${BNF_COVER_URL}?idArk=${ark}&couverture=1` : null,
        description: null,
        published_year: yearMatch ? parseInt(yearMatch[0], 10) : null,
        genres: [],
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function searchBnf(q: string): Promise<NormalizedBook[]> {
  const escaped = q.replace(/"/g, '\\"');
  return fetchBnf(`((bib.title all "${escaped}") or (bib.author all "${escaped}")) not (bib.doctype any "g h v")`, 15);
}

// Third parallel source, mainly for cover-art/catalog breadth Open Library
// and BnF both miss on mainstream/English-language titles. Keyless calls are
// rate-limited hard, so an API key is used when present (raises the quota,
// still hits an intermittent 503 ~half the time — hence the one retry).
const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

async function fetchGoogleBooks(q: string, attempt = 0): Promise<NormalizedBook[]> {
  const params = new URLSearchParams({ q, maxResults: '20' });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
  const res = await fetch(`${GOOGLE_BOOKS_URL}?${params.toString()}`);
  if (!res.ok) {
    if (res.status === 503 && attempt < 1) return fetchGoogleBooks(q, attempt + 1);
    return [];
  }
  const json = await res.json();
  return (json.items ?? []).map((item: any): NormalizedBook => {
    const info = item.volumeInfo ?? {};
    const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
    return {
      external_id: `gb_${item.id}`,
      title: info.title ?? 'Sans titre',
      author: info.authors?.join(', ') ?? null,
      cover_url: cover ? cover.replace(/^http:/, 'https:') : null,
      description: info.description ?? null,
      published_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) || null : null,
      genres: info.categories ?? [],
    };
  });
}

async function searchGoogleBooks(q: string): Promise<NormalizedBook[]> {
  try {
    return await fetchGoogleBooks(q);
  } catch {
    return [];
  }
}

export async function search(q: string): Promise<NormalizedBook[]> {
  const [olResults, bnfResults, gbResults] = await Promise.allSettled([searchByQuery(q), searchBnf(q), searchGoogleBooks(q)]);
  const ol = olResults.status === 'fulfilled' ? olResults.value : [];
  const bnf = bnfResults.status === 'fulfilled' ? bnfResults.value : [];
  const gb = gbResults.status === 'fulfilled' ? gbResults.value : [];
  if (ol.length === 0 && bnfResults.status === 'rejected' && gbResults.status === 'rejected') throw new Error('Erreur de recherche');
  // Open Library leads (best cover-art hit rate for well-known titles), then
  // BnF (fills in French small-press/indie authors OL tends to miss), then
  // Google Books (broadest catalog, backstops the rest for coverage).
  return [...ol, ...bnf, ...gb];
}

const TRENDING_SUBJECTS = [
  { label: '🐉 Fantasy incontournables', subject: 'fantasy' },
  { label: '🔪 Thrillers du moment', subject: 'thriller' },
  { label: '💕 Romance', subject: 'romance' },
  { label: '🚀 Science-fiction', subject: 'science_fiction' },
];

// Open Library's `published_in=YYYY-YYYY` filter on this endpoint doesn't
// actually restrict results (verified against the live API — classics from
// the 1600s still came back), so recency is enforced by requesting
// `sort=new` (which does work) and then dropping anything older than the
// cutoff client-side as a backstop, rather than trusting the query alone.
const RECENT_YEARS_WINDOW = 5;

async function fetchSubject(subject: string): Promise<NormalizedBook[]> {
  const res = await fetch(`${OL_SUBJECT_URL}/${subject}.json?limit=24&sort=new&details=false`);
  if (!res.ok) return [];
  const json = await res.json();
  const cutoffYear = new Date().getFullYear() - RECENT_YEARS_WINDOW;
  return (json.works ?? [])
    .map((w: any): NormalizedBook => ({
      external_id: workKeyToId(w.key),
      title: w.title ?? 'Sans titre',
      author: w.authors?.map((a: any) => a.name).join(', ') ?? null,
      cover_url: coverUrl(w.cover_id),
      description: null,
      published_year: w.first_publish_year ?? null,
      genres: w.subject?.slice(0, 5) ?? [],
    }))
    .filter((b: NormalizedBook) => b.published_year != null && b.published_year >= cutoffYear)
    .slice(0, 12);
}

// Recent French novels for the "Auteurs français" trending section. BnF's
// CQL doesn't support date-range relations (`bib.date > "2022"` and `within`
// both come back "Combinaison de relations et d'index non supportée" —
// verified live), so recency is expressed as an explicit OR-list of years
// via `any` instead. `bib.subject all "roman"` alone pulls in Spanish/
// Portuguese titles BnF also holds (it's the deposit library for anything
// distributed in France, not just French-language works), so `bib.language
// all "fre"` is required too, unlike the search-bar lookup above which
// deliberately leaves language unfiltered.
function currentAndRecentYears(count: number): string {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => currentYear - i).join(' ');
}

async function fetchFrenchBooks(): Promise<NormalizedBook[]> {
  const years = currentAndRecentYears(4);
  const query = `(bib.subject all "roman") and (bib.language all "fre") and (bib.date any "${years}") not (bib.doctype any "g h v")`;
  const results = await fetchBnf(query, 30); // fetchBnf already drops "publication en série" records
  return results.slice(0, 12);
}

export async function getTrending(): Promise<{ label: string; books: NormalizedBook[] }[]> {
  const results = await Promise.allSettled([
    ...TRENDING_SUBJECTS.map((c) => fetchSubject(c.subject)),
    fetchFrenchBooks(),
  ]);
  const labels = [...TRENDING_SUBJECTS.map((c) => c.label), '🇫🇷 Auteurs français'];
  return labels.map((label, i) => ({
    label,
    books: results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<NormalizedBook[]>).value : [],
  }));
}

// Search/subject results don't include a description — fetched on demand
// when a book's detail sheet is opened (see app/(tabs)/search.tsx).
export async function getWorkDescription(externalId: string): Promise<string | null> {
  if (!isOpenLibraryId(externalId)) return null;
  try {
    const res = await fetch(`${OL_WORKS_URL}/${externalId}.json`);
    if (!res.ok) return null;
    const json = await res.json();
    const desc = json.description;
    return typeof desc === 'string' ? desc : desc?.value ?? null;
  } catch {
    return null;
  }
}

// A few extra Open Library work fields worth surfacing on the book detail
// screen beyond what's stored on our own `books` row: a description backfill
// (in case the book was added before its description finished fetching — see
// search.tsx), the opening line, and the subject place/era tags Open Library
// tracks separately from its general subject list.
export async function getWorkExtras(externalId: string): Promise<{
  description: string | null;
  firstSentence: string | null;
  subjectPlaces: string[];
  subjectTimes: string[];
}> {
  if (!isOpenLibraryId(externalId)) return { description: null, firstSentence: null, subjectPlaces: [], subjectTimes: [] };
  try {
    const res = await fetch(`${OL_WORKS_URL}/${externalId}.json`);
    if (!res.ok) return { description: null, firstSentence: null, subjectPlaces: [], subjectTimes: [] };
    const json = await res.json();
    const desc = json.description;
    const fs = json.first_sentence;
    return {
      description: typeof desc === 'string' ? desc : desc?.value ?? null,
      firstSentence: typeof fs === 'string' ? fs : fs?.value ?? null,
      subjectPlaces: (json.subject_places ?? []).slice(0, 4),
      subjectTimes: (json.subject_times ?? []).slice(0, 4),
    };
  } catch {
    return { description: null, firstSentence: null, subjectPlaces: [], subjectTimes: [] };
  }
}

// Resolves an Open Library work id to our own `books.id`, if anyone has ever
// added it — lets the search screen's preview sheet show community ratings/
// reviews for a book before the viewer has added it themselves. Reviews are
// keyed by our internal uuid (see userBooks.getBookRatingStats/getBookReviews),
// not the external_id search results come with.
export async function getBookIdByExternalId(externalId: string): Promise<string | null> {
  const { data, error } = await supabase.from('books').select('id').eq('external_id', externalId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

// Backs the global timer bubble (components/TimerBubble.tsx), which only
// has a book_id from the active reading_sessions row and needs a title/
// cover to show regardless of which screen the app is currently on.
export async function getBookMeta(bookId: string): Promise<{ title: string; cover_url: string | null } | null> {
  const { data, error } = await supabase.from('books').select('title,cover_url').eq('id', bookId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Cheap "recommended for you" without a dedicated backend: rank the
// reader's own genres by how much signal each status carries (finished >
// currently reading; to_read/dnf don't count — a to_read pile isn't a
// confirmed taste yet, and a dnf is arguably a negative signal) then reuse
// the free-text search endpoint with the top genres as queries, since
// Open Library's subject slugs don't line up with the free-text subject
// tags stored on each book. Sorted/filtered to recent releases only (same
// `sort=new` + client-side year cutoff backstop as fetchSubject above) so
// this surfaces books to actually discover rather than the same classics
// relevance search would favor.
export async function getRecommendations(
  ownedBooks: { genres: string[]; status: string }[],
  excludeExternalIds: Set<string>
): Promise<NormalizedBook[]> {
  const weight: Record<string, number> = { done: 3, reading: 1, to_read: 0, dnf: 0 };
  const genreScores = new Map<string, number>();
  for (const book of ownedBooks) {
    const w = weight[book.status] ?? 0;
    if (w === 0) continue;
    for (const g of book.genres ?? []) {
      genreScores.set(g, (genreScores.get(g) ?? 0) + w);
    }
  }
  const topGenres = [...genreScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  if (topGenres.length === 0) return [];

  const cutoffYear = new Date().getFullYear() - RECENT_YEARS_WINDOW;
  const results = await Promise.allSettled(topGenres.map((g) => searchByQuery(g, { sort: 'new' })));
  const seen = new Set<string>();
  const merged: NormalizedBook[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const book of r.value) {
      if (book.published_year == null || book.published_year < cutoffYear) continue;
      if (excludeExternalIds.has(book.external_id) || seen.has(book.external_id)) continue;
      seen.add(book.external_id);
      merged.push(book);
    }
  }
  return merged.slice(0, 12);
}

// Normalized like search()/getTrending() (external_id, genres capped, etc.)
// so a popular result can go through the exact same add-to-list/detail path
// as a search result — it already exists in `books`, so addBookToDb's
// upsert-by-external_id just recognizes the same row instead of trying to
// insert a new one with a missing external_id (see popular_books() in
// db/schema.sql, which used to omit it entirely).
export async function getPopular(): Promise<NormalizedBook[]> {
  const { data, error } = await supabase.rpc('popular_books');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any): NormalizedBook => ({
    external_id: row.external_id,
    title: row.title ?? 'Sans titre',
    author: row.author,
    cover_url: row.cover_url,
    description: row.description,
    published_year: row.published_year,
    genres: row.genres?.slice(0, 5) ?? [],
  }));
}

export async function addBookToDb(book: NormalizedBook) {
  const { data, error } = await supabase
    .from('books')
    .upsert(
      {
        external_id: book.external_id,
        title: book.title,
        author: book.author,
        cover_url: book.cover_url,
        description: book.description,
        genres: book.genres ?? [],
        published_year: book.published_year,
        // `undefined` (not null) when unknown — this is an upsert, and this
        // book row may already exist (added by someone else, or with a
        // series set manually on the detail screen); sending an explicit
        // `null` here would wipe that out on every re-add.
        series: book.series || undefined,
        approved: true,
      },
      { onConflict: 'external_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Manual edit of the shared catalog's series name/tome number (book detail
// screen) — separate from addBookToDb since this targets `books` directly,
// not through the upsert-on-search-result path, and needs to allow clearing
// a field back to null (unlike addBookToDb's undefined-skips-column guard).
export async function updateBookSeries(bookId: string, patch: { series?: string | null; series_index?: number | null }) {
  const { error } = await supabase.from('books').update(patch).eq('id', bookId);
  if (error) throw new Error(error.message);
}

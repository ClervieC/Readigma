import { supabase } from './supabase';

// Open Library's API needs no key and sends `Access-Control-Allow-Origin: *`,
// so — unlike a provider with a secret key — this can be called straight
// from the client (web + native) with no server proxy at all.
const OL_SEARCH_URL = 'https://openlibrary.org/search.json';
const OL_SUBJECT_URL = 'https://openlibrary.org/subjects';
const OL_WORKS_URL = 'https://openlibrary.org/works';
const OL_COVERS_URL = 'https://covers.openlibrary.org/b/id';

export type NormalizedBook = {
  external_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  published_year: number | null;
  genres: string[];
};

function workKeyToId(key: string) {
  // "/works/OL893415W" -> "OL893415W"
  return key.split('/').pop() ?? key;
}

function coverUrl(coverId: number | undefined | null) {
  return coverId ? `${OL_COVERS_URL}/${coverId}-M.jpg` : null;
}

export async function search(q: string): Promise<NormalizedBook[]> {
  const params = new URLSearchParams({
    q,
    limit: '20',
    fields: 'key,title,author_name,cover_i,first_publish_year,subject',
  });
  const res = await fetch(`${OL_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) throw new Error('Erreur de recherche');
  const json = await res.json();
  return (json.docs ?? []).map((doc: any): NormalizedBook => ({
    external_id: workKeyToId(doc.key),
    title: doc.title ?? 'Sans titre',
    author: doc.author_name?.join(', ') ?? null,
    cover_url: coverUrl(doc.cover_i),
    description: null, // not returned by search — fetched lazily, see getWorkDescription
    published_year: doc.first_publish_year ?? null,
    genres: doc.subject?.slice(0, 5) ?? [],
  }));
}

const TRENDING_SUBJECTS = [
  { label: '🐉 Fantasy incontournables', subject: 'fantasy' },
  { label: '🔪 Thrillers du moment', subject: 'thriller' },
  { label: '💕 Romance', subject: 'romance' },
  { label: '🚀 Science-fiction', subject: 'science_fiction' },
];

async function fetchSubject(subject: string): Promise<NormalizedBook[]> {
  const res = await fetch(`${OL_SUBJECT_URL}/${subject}.json?limit=6&details=false`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.works ?? []).map((w: any): NormalizedBook => ({
    external_id: workKeyToId(w.key),
    title: w.title ?? 'Sans titre',
    author: w.authors?.map((a: any) => a.name).join(', ') ?? null,
    cover_url: coverUrl(w.cover_id),
    description: null,
    published_year: w.first_publish_year ?? null,
    genres: w.subject?.slice(0, 5) ?? [],
  }));
}

export async function getTrending(): Promise<{ label: string; books: NormalizedBook[] }[]> {
  const results = await Promise.allSettled(TRENDING_SUBJECTS.map((c) => fetchSubject(c.subject)));
  return TRENDING_SUBJECTS.map((c, i) => ({
    label: c.label,
    books: results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<NormalizedBook[]>).value : [],
  }));
}

// Search/subject results don't include a description — fetched on demand
// when a book's detail sheet is opened (see app/(tabs)/search.tsx).
export async function getWorkDescription(externalId: string): Promise<string | null> {
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

export async function getPopular() {
  const { data, error } = await supabase.rpc('popular_books');
  if (error) throw new Error(error.message);
  return data ?? [];
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
        approved: true,
      },
      { onConflict: 'external_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

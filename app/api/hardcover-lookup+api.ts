// Server-only route: proxies Hardcover's GraphQL API. Two reasons this can't
// just be called straight from the client like Open Library/Google Books are
// elsewhere in lib/books.ts: (1) Hardcover's API sends no
// Access-Control-Allow-Origin header, so the browser (web build) blocks it
// outright with a CORS error — routing through our own origin sidesteps that
// entirely; (2) since a server hop is required anyway, the token can live as
// a real server-only secret (HARDCOVER_API_TOKEN, no EXPO_PUBLIC_ prefix)
// instead of shipping in the client bundle.
const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';
// Hardcover's account page shows the token already prefixed with "Bearer "
// (ready to paste as-is into the header) — but it's easy to instead paste
// just the raw token, so this strips an existing "Bearer " before re-adding
// it below, working correctly either way.
const HARDCOVER_API_TOKEN = process.env.HARDCOVER_API_TOKEN?.replace(/^Bearer\s+/i, '');

export async function POST(request: Request) {
  const { isbn } = await request.json();
  if (!isbn || typeof isbn !== 'string') {
    return Response.json({ error: 'isbn is required' }, { status: 400 });
  }
  if (!HARDCOVER_API_TOKEN) return Response.json({ result: null });

  const query = `
    query FindInfo($isbn: String!) {
      editions(where: { _or: [{ isbn_13: { _eq: $isbn } }, { isbn_10: { _eq: $isbn } }] }, limit: 1) {
        image { url }
        book { image { url } description cached_tags book_series { position series { name } } }
      }
    }
  `;

  try {
    const res = await fetch(HARDCOVER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HARDCOVER_API_TOKEN}` },
      body: JSON.stringify({ query, variables: { isbn } }),
    });
    if (!res.ok) return Response.json({ result: null });
    const json = await res.json();
    const edition = json.data?.editions?.[0];
    if (!edition) return Response.json({ result: null });

    // cached_tags is grouped by tag category (e.g. { Genre: [...], Mood: [...],
    // Tone: [...], Content Warnings: [...] }); the shape of each entry isn't
    // documented in detail, so this is deliberately defensive about whether an
    // entry is a bare string or an object with a `tag` field. Unlike Open
    // Library/Google Books (a single flat subject/category list mixing real
    // genres with trope-ish subjects), Hardcover already separates "Genre"
    // from its other tag categories — so that split can be trusted and
    // carried straight into our own genres/tropes columns instead of guessing.
    const tagsByCategory = edition.book?.cached_tags ?? {};
    const namesOf = (tags: any): string[] =>
      Array.isArray(tags) ? tags.map((t: any) => (typeof t === 'string' ? t : t?.tag)).filter(Boolean) : [];
    const genreNames = namesOf(tagsByCategory.Genre);
    const genres = genreNames.length ? genreNames.slice(0, 5) : null;
    const tropeNames = Object.entries(tagsByCategory)
      .filter(([category]) => category !== 'Genre')
      .flatMap(([, tags]) => namesOf(tags));
    const tropes = tropeNames.length ? tropeNames.slice(0, 8) : null;
    // A book can be listed under more than one series/collection on Hardcover
    // (e.g. also part of an omnibus); the first entry is treated as the
    // primary one, same as how `series` has always been a single free-text
    // field on `books` rather than a list.
    const bookSeries = edition.book?.book_series?.[0];

    return Response.json({
      result: {
        cover_url: edition.image?.url ?? edition.book?.image?.url ?? null,
        description: edition.book?.description ?? null,
        genres,
        tropes,
        series: bookSeries?.series?.name ?? null,
        series_index: typeof bookSeries?.position === 'number' ? bookSeries.position : null,
      },
    });
  } catch {
    return Response.json({ result: null });
  }
}

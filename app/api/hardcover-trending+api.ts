// Server-only route: proxies Hardcover's GraphQL trending lookup for
// lib/hardcover.ts's getHardcoverTrending() — see hardcover-search+api.ts's
// comment for why this needs to be a server route rather than a direct
// client call (Hardcover's CORS preflight blocks the browser on web).
// books_trending only returns an ordered id list, so this does the
// necessary second fetch (by id) server-side too, and re-sorts the result
// back into that ranked order before responding — the `books` query's own
// row order isn't guaranteed to match it.
const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';
const HARDCOVER_API_TOKEN = process.env.HARDCOVER_API_TOKEN?.trim();

async function hcQuery(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(HARDCOVER_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: HARDCOVER_API_TOKEN! },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.errors) return null;
  return json.data;
}

export async function POST(request: Request) {
  const { duration, limit } = await request.json();
  if (!duration || typeof duration !== 'string') {
    return Response.json({ error: 'duration is required' }, { status: 400 });
  }
  if (!HARDCOVER_API_TOKEN) return Response.json({ books: [] });

  try {
    const idsData = await hcQuery(
      `query Trending($duration: TrendingDuration, $limit: Int) {
        books_trending(duration: $duration, limit: $limit, offset: 0) { ids error }
      }`,
      { duration, limit: typeof limit === 'number' ? limit : 12 },
    );
    const ids: number[] = idsData?.books_trending?.ids ?? [];
    if (ids.length === 0) return Response.json({ books: [] });

    const booksData = await hcQuery(
      `query BooksByIds($ids: [Int!]) {
        books(where: { id: { _in: $ids } }) {
          id
          title
          release_year
          description
          cached_tags
          image { url }
          contributions(where: { contributable_type: { _eq: "Book" } }) {
            author { name }
          }
        }
      }`,
      { ids },
    );
    const rows: any[] = booksData?.books ?? [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    return Response.json({ books: ordered });
  } catch {
    return Response.json({ books: [] });
  }
}

// Server-only route: proxies Hardcover's GraphQL search for lib/hardcover.ts's
// searchHardcover()/searchHardcoverByGenre(). Same reasoning as
// hardcover-lookup+api.ts for routing through our own server rather than
// calling Hardcover directly from the client: a real browser's CORS
// preflight (OPTIONS) on Hardcover's API comes back with no
// Access-Control-Allow-Origin header (verified live — a bare curl POST is
// misleading here since it never sends a preflight at all), so a direct
// client call is blocked on web even though Hardcover's actual POST
// response does carry that header. Also keeps HARDCOVER_API_TOKEN a real
// server-only secret instead of shipping it in the client bundle.
const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';
const HARDCOVER_API_TOKEN = process.env.HARDCOVER_API_TOKEN?.trim();

export async function POST(request: Request) {
  const { query, limit, filterBy, sort } = await request.json();
  if (!query || typeof query !== 'string') {
    return Response.json({ error: 'query is required' }, { status: 400 });
  }
  if (!HARDCOVER_API_TOKEN) return Response.json({ results: [] });

  // filterBy/sort are optional Typesense query-string params (e.g.
  // `genres:=[Romance]` / `users_count:desc`) — see getHardcoverGenrePopular
  // in lib/hardcover.ts, which is the only caller that passes them. Plain
  // keyword search (searchHardcover) omits both and keeps prior behavior.
  const gql = `
    query Search($q: String!, $perPage: Int!, $filterBy: String, $sort: String) {
      search(query: $q, query_type: "Book", per_page: $perPage, page: 1, filter_by: $filterBy, sort: $sort) { results }
    }
  `;

  try {
    const res = await fetch(HARDCOVER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: HARDCOVER_API_TOKEN },
      body: JSON.stringify({
        query: gql,
        variables: {
          q: query,
          perPage: typeof limit === 'number' ? limit : 20,
          filterBy: typeof filterBy === 'string' ? filterBy : null,
          sort: typeof sort === 'string' ? sort : null,
        },
      }),
    });
    if (!res.ok) return Response.json({ results: [] });
    const json = await res.json();
    const hits = json.data?.search?.results?.hits;
    return Response.json({ results: Array.isArray(hits) ? hits.map((h: any) => h.document) : [] });
  } catch {
    return Response.json({ results: [] });
  }
}

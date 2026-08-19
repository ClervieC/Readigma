// Re-serves a remote image with permissive CORS headers — needed by
// components/ShareBookCard.tsx's web capture path (react-native-view-shot
// -> html2canvas). A plain <img> displays a cross-origin image fine with no
// CORS headers at all, but html2canvas has to read the image's actual pixel
// data back out to draw it into a canvas, which the browser refuses unless
// the image was served with Access-Control-Allow-Origin — most book-cover
// CDNs (e.g. Hardcover's) don't send that, so the capture silently drops or
// fails on that image without this proxy in between.
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get('url');
  if (!target) return new Response('Missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new Response('Invalid protocol', { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString());
    if (!res.ok) return new Response('Not found', { status: 404 });
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const body = await res.arrayBuffer();
    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('Fetch failed', { status: 502 });
  }
}

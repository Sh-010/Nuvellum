// Same-origin social preview endpoint. Uses Nuvellum's existing landscape social card
// for the story, or the site's PNG monogram if card generation has not finished.
const CARD_ORIGIN = 'https://raw.githubusercontent.com/Sh-010/Nuvellum/social-assets/cards/';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BYTES = 6_000_000;
const imgHeaders = {
  'Content-Type': 'image/png',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
  'X-Robots-Tag': 'noindex'
};

export function createOgHandler({ fetchImpl = fetch } = {}) {
  return async function handle(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug') || '';
    if (!SLUG_RE.test(slug) || slug.length > 180) {
      return new Response('Invalid article slug', { status: 400 });
    }
    const fallback = () => Response.redirect(new URL('/icons/nuvellum-512.png', url), 302);
    try {
      const result = await fetchImpl(`${CARD_ORIGIN}${slug}/landscape.png`, {
        headers: { Accept: 'image/png', 'User-Agent': 'Nuvellum-OG/1.0' },
        signal: AbortSignal.timeout(5000)
      });
      const type = (result.headers.get('content-type') || '').toLowerCase();
      if (!result.ok || !type.startsWith('image/png')) return fallback();
      const data = await result.arrayBuffer();
      if (!data.byteLength || data.byteLength > MAX_BYTES) return fallback();
      return new Response(request.method === 'HEAD' ? null : data, { status: 200, headers: imgHeaders });
    } catch {
      return fallback();
    }
  };
}
export default { fetch: createOgHandler() };

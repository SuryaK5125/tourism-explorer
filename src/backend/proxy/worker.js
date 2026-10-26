// Geoapify key-holding proxy, deployed as its OWN Cloudflare Worker (not published to hyperDart).
// The key is stored with `wrangler secret put GEOAPIFY_API_KEY`, so it never appears
// in git, the frontend, or the npm package. Only the two Geoapify endpoints we use are allowed.
//
//   GET /v2/places?...                 -> https://api.geoapify.com/v2/places?...&apiKey=KEY
//   GET /v1/tile/<style>/<z>/<x>/<y>.png -> https://maps.geoapify.com/v1/tile/...?apiKey=KEY

const ROUTES = [
  { pattern: /^\/v2\/places$/, host: 'api.geoapify.com' },
  { pattern: /^\/v1\/tile\/[\w-]+\/\d+\/\d+\/\d+\.png$/, host: 'maps.geoapify.com' },
]

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })

    const url = new URL(request.url)
    const route = ROUTES.find((r) => r.pattern.test(url.pathname))
    if (!route) return new Response('Not found', { status: 404 })
    if (!env.GEOAPIFY_API_KEY) {
      console.error('GEOAPIFY_API_KEY secret is not set')
      return Response.json({ error: 'NOT_CONFIGURED' }, { status: 500 })
    }

    const upstream = new URL(`https://${route.host}${url.pathname}`)
    url.searchParams.forEach((value, key) => {
      if (key !== 'apiKey') upstream.searchParams.set(key, value)
    })
    upstream.searchParams.set('apiKey', env.GEOAPIFY_API_KEY)

    const res = await fetch(upstream)
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
        'Cache-Control': route.host === 'maps.geoapify.com' ? 'public, max-age=86400' : 'no-store',
      },
    })
  },
}

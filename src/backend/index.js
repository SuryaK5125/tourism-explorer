import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

// Logger Middleware
app.use('*', logger())

// Enable CORS
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowedOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        // If your frontend runs on a different local port (e.g. 5174),
        // add it here like: 'http://localhost:5174'

        // ⚠️ DEV_DOMAIN and PROD_DOMAIN are injected via Cloudflare env vars.
        // These values are available at runtime once your component is
        // published and approved. Do NOT remove them — they are required
        // for deployed environments to work correctly.
        c.env.DEV_DOMAIN,
        c.env.STAGING_DOMAIN,
        c.env.PROD_DOMAIN,
      ].filter(Boolean) 

      return allowedOrigins.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
)


//  Route: Health check
app.get('/api/message', (c) =>
  c.json({ message: 'Tourism Explorer backend is running' })
)

// Category id (sent by the frontend) -> groups of Geoapify categories.
// Each group is one request (max 20 results each), so a broad search like "sights"
// gets candidates from several kinds of place instead of just the 20 nearest.
// Kept on the server so the frontend can only ask for known, curated sets.
const CATEGORY_MAP = {
  sights: ['heritage,tourism.attraction', 'tourism.sights', 'entertainment.museum'],
  landmarks: ['heritage,tourism.sights.castle,tourism.sights.fort,tourism.sights.tower', 'tourism.sights,tourism.attraction'],
  museums: ['entertainment.museum', 'entertainment.culture.gallery'],
  temples: [
    'tourism.sights.place_of_worship.temple,tourism.sights.place_of_worship.shrine',
    'religion.place_of_worship.hinduism,religion.place_of_worship.buddhism,religion.place_of_worship.sikhism,religion.place_of_worship.shinto',
  ],
  worship: ['tourism.sights.place_of_worship', 'religion.place_of_worship'],
  monuments: ['tourism.sights.memorial,tourism.sights.city_gate,tourism.sights.tower'],
  forts: ['tourism.sights.fort,tourism.sights.castle'],
  historic: ['tourism.sights.archaeological_site,tourism.sights.ruines,heritage', 'tourism.sights.castle,tourism.sights.fort,building.historic'],
  parks: ['leisure.park,natural.protected_area'],
  viewpoints: ['tourism.attraction.viewpoint,natural.mountain.peak'],
}

// Anything in these groups is not a sight, even if it is also tagged as one
const EXCLUDED_PREFIXES = ['catering', 'accommodation', 'commercial', 'service', 'office']

// Higher score = shown earlier. Landmarks and heritage first.
const CATEGORY_WEIGHTS = [
  ['heritage', 30],
  ['tourism.sights.castle', 25],
  ['tourism.sights.fort', 25],
  ['tourism.sights.place_of_worship', 20],
  ['tourism.sights', 20],
  ['entertainment.museum', 18],
  ['tourism.attraction', 12],
  ['leisure.park', 8],
]

const MAX_LIMIT = 20

// Builds a Geoapify URL.
// Local dev: GEOAPIFY_API_KEY from .dev.vars -> call Geoapify directly.
// Production: hyperDart has no secret store, so GEOAPIFY_PROXY_URL points to our own
// proxy Worker (src/backend/proxy/worker.js), which adds the key from a Cloudflare secret.
// Returns null when neither is configured.
function geoapifyUrl(env, host, path, query = '') {
  if (env.GEOAPIFY_API_KEY) {
    return `https://${host}${path}?${query}${query ? '&' : ''}apiKey=${env.GEOAPIFY_API_KEY}`
  }
  if (env.GEOAPIFY_PROXY_URL) {
    return `${env.GEOAPIFY_PROXY_URL.replace(/\/$/, '')}${path}${query ? '?' + query : ''}`
  }
  return null
}

const isGeoapifyConfigured = (env) => Boolean(env.GEOAPIFY_API_KEY || env.GEOAPIFY_PROXY_URL)

function normalizePlace(feature) {
  const p = feature.properties || {}
  const raw = p.datasource?.raw || {}
  const localName = p.name || null
  const englishName = raw['name:en'] || p.name_international?.en || null
  return {
    id: p.place_id,
    // Show the English name first; keep the local name as a subtitle
    name: englishName || localName,
    localName: englishName && localName !== englishName ? localName : null,
    wikidata: raw.wikidata || p.wiki_and_media?.wikidata || null,
    lat: p.lat,
    lon: p.lon,
    distance: typeof p.distance === 'number' ? p.distance : null,
    address: p.address_line2 || p.formatted || null,
    categories: p.categories || [],
    description: [raw['description:en'], raw.description].find(isReadableEnglish) || null,
    wikipedia: raw.wikipedia || null, // e.g. "en:Red Fort"
    website: p.website || raw.website || null,
    openingHours: p.opening_hours || raw.opening_hours || null,
    heritage: Boolean(raw.heritage || (p.categories || []).includes('heritage')),
  }
}

function isTouristPlace(place) {
  if (!place.name) return false
  return !place.categories.some((cat) =>
    EXCLUDED_PREFIXES.some((prefix) => cat === prefix || cat.startsWith(prefix + '.'))
  )
}

function scorePlace(place) {
  let score = 0
  for (const [prefix, weight] of CATEGORY_WEIGHTS) {
    if (place.categories.some((cat) => cat.startsWith(prefix))) score = Math.max(score, weight)
  }
  // A Wikipedia/Wikidata entry is the best signal that a place is notable
  if (place.wikipedia) score += 25
  if (place.wikidata) score += 10
  if (place.description) score += 5
  if (place.sitelinks) score += Math.min(place.sitelinks, 120) / 3 // e.g. Colosseum (~150) +40
  // Gentle distance penalty: 1 point per km
  if (place.distance != null) score -= place.distance / 1000
  return score
}

async function fetchGeoapify({ categories, lat, lon, radius, env }) {
  const query =
    `categories=${categories}` +
    `&filter=circle:${lon},${lat},${radius}` +
    `&bias=proximity:${lon},${lat}` +
    `&limit=${MAX_LIMIT}`
  const res = await fetch(geoapifyUrl(env, 'api.geoapify.com', '/v2/places', query), {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Geoapify responded ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.features || []).map(normalizePlace).filter(isTouristPlace)
}

// Words too common to tell two places apart
const GENERIC_WORDS = new Set(['temple', 'museum', 'mandir', 'gurdwara', 'gurudwara', 'sahib', 'church', 'mosque', 'memorial', 'national', 'garden', 'park'])

function nameWords(name) {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w))
}

function metersBetween(a, b) {
  const dx = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  const dy = (a.lat - b.lat) * 110540
  return Math.hypot(dx, dy)
}

// OSM often has the same sight twice (a building + its grounds, or two spellings).
// Input must be sorted best-first; the best copy is kept.
function removeDuplicates(places) {
  const kept = []
  for (const place of places) {
    const words = nameWords(place.name)
    const isDuplicate = kept.some(
      (k) =>
        k.id === place.id ||
        k.name.toLowerCase() === place.name.toLowerCase() ||
        (place.wikipedia && k.wikipedia === place.wikipedia) ||
        (place.wikidata && k.wikidata === place.wikidata) ||
        metersBetween(k, place) < 60 ||
        (metersBetween(k, place) < 300 && nameWords(k.name).some((w) => words.includes(w)))
    )
    if (!isDuplicate) kept.push(place)
  }
  return kept
}

// Wikimedia asks API clients to identify themselves with a URL/contact
const WIKI_HEADERS = {
  'User-Agent': 'TourismExplorer/1.0 (https://hyperdart.com; hyperDart tourism component) hono-workers',
  'Api-User-Agent': 'TourismExplorer/1.0 (hyperDart tourism component)',
}

// One batched Wikidata call: English article title + a short "what it is" line
async function addWikidataInfo(places) {
  const ids = places.map((p) => p.wikidata).filter((id) => /^Q\d+$/.test(id || ''))
  if (!ids.length) return places
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks|descriptions' +
    `&languages=en&ids=${ids.slice(0, 50).join('|')}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: WIKI_HEADERS })
  if (!res.ok) throw new Error(`Wikidata ${res.status}`)
  const { entities = {} } = await res.json()
  return places.map((p) => {
    const entity = entities[p.wikidata]
    if (!entity) return p
    return {
      ...p,
      summary: entity.descriptions?.en?.value || null,
      enwiki: entity.sitelinks?.enwiki?.title || null,
      // How many Wikipedia/Wikimedia editions cover it: a strong "how famous is this" signal
      sitelinks: Object.keys(entity.sitelinks || {}).length,
    }
  })
}

// English Wikipedia title for a place: from Wikidata, or OSM's tag when it is already "en:..."
function englishTitle(place) {
  if (place.enwiki) return place.enwiki
  const match = /^en:(.+)$/.exec(place.wikipedia || '')
  return match ? match[1] : null
}

// ONE batched English Wikipedia request for intro text + photo of up to 20 places
// (per-page requests in parallel get rate-limited by Wikimedia)
async function addWikipediaSummaries(places) {
  const titles = [...new Set(places.map(englishTitle).filter(Boolean))].slice(0, 20)
  if (!titles.length) return places
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1' +
    '&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=3&exlimit=20' +
    `&piprop=thumbnail|original&pithumbsize=400&pilimit=20&titles=${encodeURIComponent(titles.join('|'))}`
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: WIKI_HEADERS })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const { query = {} } = await res.json()

  // Follow Wikipedia's title normalisation and redirects back to the title we asked for
  const finalTitle = (title) => {
    let t = title.replace(/_/g, ' ')
    for (const step of [...(query.normalized || []), ...(query.redirects || [])]) if (step.from === t) t = step.to
    return t
  }
  const pages = Object.fromEntries((query.pages || []).filter((p) => !p.missing).map((p) => [p.title, p]))

  return places.map((place) => {
    const title = englishTitle(place)
    const page = title && pages[finalTitle(title)]
    if (!page) return place
    return {
      ...place,
      // Wikipedia's intro is a better "what is this" than OSM's free-text note (often visitor info)
      description: cleanExtract(page.extract) || place.description,
      image: pickPhoto(page.thumbnail, page.original),
      wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    }
  })
}

// Drop pronunciation/etymology brackets like "(KOL-ə-SEE-əm; Italian: Colosseo)"
function cleanExtract(text) {
  if (!text) return null
  const bracket = /\s*\((?:[^()]|\([^()]*\))*\)/g // a (...) group, allowing one nested (...)
  const isNoise = (group) => /[;ˈəː]|ISO:|transl\.|lit\.|pronounced|IPA/.test(group)
  return text.replace(bracket, (group) => (isNoise(group) ? '' : group)).replace(/\s+,/g, ',').trim() || null
}

// Logos, seals, maps and diagrams make poor destination photos
const NOT_A_PHOTO = /\.svg|logo|seal|emblem|coat[_ ]of[_ ]arms|flag|signature|icon|locator|location[_ ]map|map\b|plan\b|diagram|insignia/i

function pickPhoto(thumb, original) {
  if (!thumb?.source || NOT_A_PHOTO.test(original?.source || thumb.source)) return null
  const ratio = (original?.width || thumb.width) / (original?.height || thumb.height)
  if (!(ratio > 0.4 && ratio < 2.4)) return null // banners and very tall graphics are rarely photos
  return thumb.source
}

// Common English function words. OSM notes are often in the local language
// (Italian, French, ...), and Latin script alone doesn't make text English.
const ENGLISH_WORDS = /\b(the|of|and|is|in|to|with|for|from|on|by|was|built|its|this|a|an)\b/i

// True when text is mostly Latin script AND reads as English
// (keeps Japanese/Tamil/Malayalam/Italian notes out of English results)
function isReadableEnglish(text) {
  if (!text) return false
  const letters = text.match(/\p{L}/gu) || []
  const latin = text.match(/\p{Script=Latin}/gu) || []
  if (!letters.length || latin.length / letters.length < 0.9) return false
  const words = text.split(/\s+/).length
  return ENGLISH_WORDS.test(text) || (words <= 6 && /^[\x00-\x7F]*$/.test(text))
}

//  Route: Map tiles proxy, so the Geoapify key never reaches the browser
//  GET /api/tiles/light/13/2411/3079.png
const TILE_STYLES = { light: 'osm-bright-smooth', dark: 'dark-matter-brown' }

app.get('/api/tiles/:style/:z/:x/:y', async (c) => {
  const { style, z, x } = c.req.param()
  const y = c.req.param('y').replace(/\.png$/, '')
  if (!TILE_STYLES[style] || ![z, x, y].every((n) => /^\d+$/.test(n)) || Number(z) > 20) {
    return c.json({ error: 'INVALID_TILE' }, 400)
  }
  if (!isGeoapifyConfigured(c.env)) return c.json({ error: 'NOT_CONFIGURED' }, 500)

  const res = await fetch(geoapifyUrl(c.env, 'maps.geoapify.com', `/v1/tile/${TILE_STYLES[style]}/${z}/${x}/${y}.png`))
  if (!res.ok) {
    console.error(`Tile ${style}/${z}/${x}/${y} failed: ${res.status}`)
    return c.body(null, res.status)
  }
  return c.body(res.body, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=86400',
  })
})

//  Route: Tourist places around a point
//  GET /api/places?lat=28.61&lon=77.2&category=museums
app.get('/api/places', async (c) => {
  const lat = Number(c.req.query('lat'))
  const lon = Number(c.req.query('lon'))
  const category = c.req.query('category') || 'sights'

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return c.json({ error: 'INVALID_LOCATION', message: 'A valid latitude and longitude are required.' }, 400)
  }
  if (!CATEGORY_MAP[category]) {
    return c.json({ error: 'INVALID_CATEGORY', message: `Unknown category "${category}".` }, 400)
  }
  if (!isGeoapifyConfigured(c.env)) {
    console.error('Neither GEOAPIFY_API_KEY nor GEOAPIFY_PROXY_URL is configured')
    return c.json({ error: 'NOT_CONFIGURED', message: 'The places service is not configured.' }, 500)
  }

  const searchAll = async (radius) => {
    const groups = await Promise.all(
      CATEGORY_MAP[category].map((categories) => fetchGeoapify({ categories, lat, lon, radius, env: c.env }))
    )
    return groups.flat()
  }

  try {
    // Start around the city centre; widen the circle if it is sparse (small towns)
    let radius = 5000
    let places = await searchAll(radius)
    if (places.length < 5) {
      radius = 25000
      places = await searchAll(radius)
    }

    places = removeDuplicates(places.sort((a, b) => scorePlace(b) - scorePlace(a))).slice(0, MAX_LIMIT)

    // Enrichment is optional: if Wikidata/Wikipedia fail we log it and still return the places
    try {
      places = (await addWikidataInfo(places)).sort((a, b) => scorePlace(b) - scorePlace(a))
    } catch (err) {
      console.warn('Wikidata enrichment failed:', err.message)
    }
    try {
      places = await addWikipediaSummaries(places)
    } catch (err) {
      console.warn('Wikipedia enrichment failed:', err.message)
    }

    return c.json({ places, meta: { category, radius, count: places.length } })
  } catch (err) {
    console.error('Places lookup failed:', err.message)
    return c.json({ error: 'UPSTREAM_ERROR', message: 'Could not reach the places service. Please try again.' }, 502)
  }
})

//  Route: Insert Data into D1
// app.post('/api/users', async (c) => {
//   const body = await c.req.json()
//   const { name, email } = body

//   if (!name || !email) {
//     return c.json({ error: 'Name and email are required' }, 400)
//   }

//   try {
//     await c.env.DB.prepare(
//       'INSERT INTO users (name, email) VALUES (?, ?)'
//     ).bind(name, email).run()

//     return c.json({ success: true, message: 'User added successfully' }, 201)
//   } catch (err) {
//     return c.json({ error: 'Database error', details: err.message }, 500)
//   }
// })

//  Route: Fetch All Users
// app.get('/api/users', async (c) => {
//   try {
//     const { results } = await c.env.DB.prepare('SELECT * FROM users').all()
//     return c.json(results)
//   } catch (err) {
//     return c.json({ error: 'Database error', details: err.message }, 500)
//   }
// })

export default app

// Turns hyperDart's searchData (array or object) into what the explorer needs:
// the place being asked about and the kind of attractions wanted.

// Order matters: the first matching category wins.
// The `id` must match a key of CATEGORY_MAP in src/backend/index.js.
export const CATEGORIES = [
  { id: 'museums', label: 'Museums', pattern: /\b(museums?|galler(y|ies))\b/i },
  { id: 'temples', label: 'Temples', pattern: /\b(temples?|shrines?|guru?dwaras?|pagodas?|mandirs?)\b/i },
  { id: 'worship', label: 'Holy places', pattern: /\b(churche?s?|cathedrals?|mosques?|places? of worship|religious)\b/i },
  { id: 'forts', label: 'Forts & castles', pattern: /\b(forts?|castles?|palaces?)\b/i },
  { id: 'monuments', label: 'Monuments', pattern: /\b(monuments?|memorials?|statues?)\b/i },
  { id: 'historic', label: 'Historic sites', chip: 'Historic', pattern: /\b(historic(al)?|heritage|ruins?|archaeolog\w*)\b/i },
  { id: 'parks', label: 'Parks & nature', chip: 'Parks', pattern: /\b(parks?|gardens?|nature)\b/i },
  { id: 'viewpoints', label: 'Viewpoints', pattern: /\b(viewpoints?|views?|lookouts?|scenic)\b/i },
  { id: 'landmarks', label: 'Landmarks', pattern: /\blandmarks?\b/i },
]

export const DEFAULT_CATEGORY = { id: 'sights', label: 'Top sights' }

// Categories offered as chips in the UI
export const CHIP_CATEGORIES = [
  DEFAULT_CATEGORY,
  ...['landmarks', 'museums', 'temples', 'historic', 'parks', 'viewpoints'].map((id) =>
    CATEGORIES.find((c) => c.id === id)
  ),
]

export function detectCategory(query = '') {
  return CATEGORIES.find((c) => c.pattern.test(query)) || DEFAULT_CATEGORY
}

function toNumber(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return Number.isFinite(n) ? n : null
}

// Picks the most relevant HD_LOCATION entity from the query
function findLocationEntity(entities = []) {
  return entities
    .filter((e) => e?.collectionType === 'HD_LOCATION' || e?.entityType === 'LOCATION' || e?.entityInfo?.geo)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))[0]
}

/**
 * Returns { query, category, place, error }.
 * `place` is null when the query has no usable location; `error` explains why.
 */
export function normalizeSearchData(searchData) {
  const data = Array.isArray(searchData) ? searchData[0] : searchData
  const query = data?.query || ''
  if (!data) {
    return { query, category: detectCategory(query), place: null, error: 'NO_SEARCH_DATA' }
  }

  const entity = findLocationEntity(data.entities)
  // Ignore the place name itself, so "sights in Fort Worth" isn't read as "forts"
  const category = detectCategory(entity?.word ? query.replace(entity.word, ' ') : query)
  const geo = entity?.entityInfo?.geo
  const lat = toNumber(geo?.lat)
  const lon = toNumber(geo?.long ?? geo?.lon ?? geo?.lng)

  if (!entity || lat === null || lon === null) {
    return { query, category, place: null, error: 'NO_LOCATION' }
  }

  const name = geo.city || entity.word || geo.state || geo.country
  return {
    query,
    category,
    error: null,
    place: {
      name,
      region: [geo.state, geo.country].filter((part) => part && part !== name).join(', '),
      countryCode: geo.countryCode || null,
      timezone: geo.tz || null,
      lat,
      lon,
    },
  }
}

// Calls our own backend (which holds the Geoapify key). Never calls Geoapify directly.

export class PlacesError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const TIMEOUT_MS = 15000

export async function fetchPlaces(apiUrl, { lat, lon, category }, signal) {
  const params = new URLSearchParams({ lat, lon, category })
  // Abort if the caller cancels (new search) OR the backend hangs too long
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${apiUrl}/api/places?${params}`, { signal: AbortSignal.any([signal, timeout]) })
  } catch (err) {
    if (timeout.aborted) throw new PlacesError('TIMEOUT', 'The places service took too long to respond.')
    if (err.name === 'AbortError') throw err
    throw new PlacesError('NETWORK', 'Could not reach the Tourism Explorer service.')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new PlacesError(body?.error || 'HTTP_' + res.status, body?.message || `Request failed (${res.status}).`)
  }
  if (!Array.isArray(body?.places)) {
    throw new PlacesError('BAD_RESPONSE', 'The places service returned an unexpected response.')
  }
  return body
}

// Great-circle distance in km
export function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export function formatDistance(km) {
  if (km == null) return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`
}

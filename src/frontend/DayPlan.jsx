import CloseIcon from '@mui/icons-material/Close'
import { distanceKm, formatDistance } from './placesApi'
import { getPlaceKind } from './placeKind'

const DAY_START_MINUTES = 9 * 60 // 9:00 AM
const WALKABLE_KM = 1.5

// Visit order: always go to the nearest unvisited place next (nearest-neighbour)
export function orderByNearest(start, places) {
  const remaining = [...places]
  const route = []
  let current = start
  while (remaining.length) {
    let best = 0
    remaining.forEach((p, i) => {
      if (distanceKm(current, p) < distanceKm(current, remaining[best])) best = i
    })
    current = remaining.splice(best, 1)[0]
    route.push(current)
  }
  return route
}

function visitMinutes(place) {
  const { label } = getPlaceKind(place.categories)
  if (/museum|gallery|fort|castle|heritage/i.test(label)) return 90
  if (/park|nature/i.test(label)) return 60
  return 45
}

function travel(km) {
  const walk = km <= WALKABLE_KM
  const minutes = walk ? (km / 4.5) * 60 : (km / 20) * 60 + 10 // ride + waiting time
  return { walk, minutes: Math.max(5, Math.round(minutes / 5) * 5) }
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function buildSchedule(start, places) {
  let clock = DAY_START_MINUTES
  let previous = start
  return orderByNearest(start, places).map((place) => {
    const km = distanceKm(previous, place)
    const leg = travel(km)
    clock += leg.minutes
    const stop = { place, km, leg, arrive: clock, stay: visitMinutes(place) }
    clock += stop.stay
    previous = place
    return stop
  })
}

function DayPlan({ center, places, onRemove }) {
  if (!places.length) {
    return <p className="te-plan__empty">Add places with + to build a day plan.</p>
  }

  const stops = buildSchedule(center, places)
  const last = stops[stops.length - 1]
  const totalKm = stops.reduce((sum, s) => sum + s.km, 0)

  return (
    <div className="te-plan">
      <p className="te-plan__summary">
        {stops.length} stops · {formatDistance(totalKm)} · 9:00 AM – {formatTime(last.arrive + last.stay)}
      </p>
      <ol className="te-plan__list">
        {stops.map(({ place, km, leg, arrive, stay }, i) => (
          <li key={place.id} className="te-plan__stop" style={{ '--i': i }}>
            <span className="te-plan__leg">
              {leg.minutes} min {leg.walk ? 'walk' : 'drive'} · {formatDistance(km)}
            </span>
            <div className="te-plan__row">
              <time>{formatTime(arrive)}</time>
              <span className="te-plan__dot" aria-hidden="true" />
              <div className="te-plan__info">
                <strong>{place.name}</strong>
                <span>
                  {getPlaceKind(place.categories).label} · {stay} min
                </span>
              </div>
              <button className="te-icon-btn" aria-label={`Remove ${place.name}`} onClick={() => onRemove(place.id)}>
                <CloseIcon fontSize="inherit" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <p className="te-plan__note">Ordered nearest-next from the centre. Times are estimates.</p>
    </div>
  )
}

export default DayPlan

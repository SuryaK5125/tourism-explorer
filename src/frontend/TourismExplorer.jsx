import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'
import { normalizeSearchData, CHIP_CATEGORIES } from './searchParsing'
import { fetchPlaces } from './placesApi'
import PlaceCard from './PlaceCard'
import MapView from './MapView'
import DayPlan, { orderByNearest } from './DayPlan'
import { LoadingState, MessageState } from './StatusMessage'
import './explorer.css'

const DEFAULT_PLAN_SIZE = 4
const TABS = [
  { id: 'guide', label: 'Guide' },
  { id: 'map', label: 'Map' },
  { id: 'plan', label: 'Day plan' },
]

// Current time at the destination, from the timezone in searchData (e.g. "3:42 PM")
function localTime(timezone) {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date())
  } catch {
    return null // unknown timezone id
  }
}

// Narrow layout when hyperDart shows us in the sidebar, or the frame is simply narrow
function useIsCompact(ref, format) {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 600))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return format === 'sidebar' || format === 'mobile' || narrow
}

function TourismExplorer(props) {
  const API_URL =
    process.env.NODE_ENV === 'production' ? props.deployedBackendURL ?? '' : import.meta.env.VITE_API_URL

  const mode = useTheme().palette.mode === 'dark' ? 'dark' : 'light'
  const rootRef = useRef(null)
  const compact = useIsCompact(rootRef, props.format)

  const search = useMemo(() => normalizeSearchData(props.searchData), [props.searchData])
  const { place } = search

  const [category, setCategory] = useState(search.category)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [places, setPlaces] = useState([])
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('guide')
  const [planIds, setPlanIds] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const loadedSent = useRef(false)

  // A new search resets the category to what the query asked for
  useEffect(() => setCategory(search.category), [search])

  useEffect(() => {
    if (!place) return
    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    fetchPlaces(API_URL, { lat: place.lat, lon: place.lon, category: category.id }, controller.signal)
      .then((data) => {
        setPlaces(data.places)
        setMeta(data.meta)
        setPlanIds(data.places.slice(0, DEFAULT_PLAN_SIZE).map((p) => p.id))
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('Tourism Explorer: failed to load places', err)
        setError(err)
        setStatus('error')
      })
    return () => controller.abort()
  }, [API_URL, place, category, retryKey])

  // Tell hyperDart we're ready once the first real content (or a final message) is on screen
  useEffect(() => {
    if (loadedSent.current) return
    if (!place || status !== 'loading') {
      loadedSent.current = true
      props?.messageHandlers?.componentLoaded?.()
    }
  }, [place, status, props?.messageHandlers])

  const togglePlan = useCallback(
    (id) => setPlanIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])),
    []
  )
  const planPlaces = useMemo(() => places.filter((p) => planIds.includes(p.id)), [places, planIds])
  // Same visiting order as the DayPlan list, drawn on the map as a route
  const planRoute = useMemo(() => (place ? orderByNearest(place, planPlaces) : []), [place, planPlaces])

  const shell = (children) => (
    <div ref={rootRef} className={`te-root te-${mode}${compact ? ' te-compact' : ''}`}>
      {children}
    </div>
  )

  if (!place) {
    return shell(
      <MessageState title="Where to?">
        {search.query ? (
          <>
            We couldn't find a place in “{search.query}”. Try something like <em>museums in Delhi</em> or{' '}
            <em>things to do in Paris</em>.
          </>
        ) : (
          <>Search for a city to explore, e.g. <em>tourist attractions in Rome</em>.</>
        )}
      </MessageState>
    )
  }

  const radiusKm = meta ? meta.radius / 1000 : 5
  const renderMap = (height, fitRoute = false) => (
    <MapView
      apiUrl={API_URL}
      center={place}
      places={places}
      route={planRoute}
      fitRoute={fitRoute}
      mode={mode}
      activeId={activeId}
      onSelect={setActiveId}
      height={height}
    />
  )
  const plan = <DayPlan center={place} places={planPlaces} onRemove={togglePlan} />

  let body
  if (status === 'loading') {
    body = <LoadingState placeName={place.name} />
  } else if (status === 'error') {
    body = (
      <MessageState
        title="Couldn't load places"
        action={
          <button className="te-btn te-btn--primary" onClick={() => setRetryKey((k) => k + 1)}>
            Try again
          </button>
        }
      >
        {error?.message || 'Something went wrong while loading places.'}
      </MessageState>
    )
  } else if (!places.length) {
    body = (
      <MessageState
        title={`No ${category.label.toLowerCase()} found`}
        action={
          category.id !== 'sights' && (
            <button className="te-btn te-btn--primary" onClick={() => setCategory(CHIP_CATEGORIES[0])}>
              Show top sights instead
            </button>
          )
        }
      >
        We looked within {radiusKm} km of {place.name} and found nothing suitable.
      </MessageState>
    )
  } else {
    const list = (
      <div className="te-list">
        {places.map((p, i) => (
          <PlaceCard
            key={p.id}
            place={p}
            index={i}
            featured={i === 0}
            active={p.id === activeId}
            inPlan={planIds.includes(p.id)}
            onTogglePlan={togglePlan}
            onSelect={setActiveId}
          />
        ))}
      </div>
    )

    body = compact ? (
      <>
        <nav className="te-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`te-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'plan' && planIds.length > 0 && <span className="te-tab__count">{planPlaces.length}</span>}
            </button>
          ))}
        </nav>
        <div className="te-panel" key={tab}>
          {tab === 'guide' && list}
          {tab === 'map' && renderMap(380)}
          {tab === 'plan' && (
            <>
              {planPlaces.length > 0 && renderMap(190, true)}
              {plan}
            </>
          )}
        </div>
      </>
    ) : (
      <div className="te-columns">
        {list}
        <aside className="te-aside">
          {renderMap(280)}
          <section className="te-aside__plan">
            <h4 className="te-section-title">Day plan</h4>
            {plan}
          </section>
        </aside>
      </div>
    )
  }

  return shell(
    <>
      <header className="te-header">
        {place.region && <p className="te-eyebrow">{place.region}</p>}
        <h2 className="te-title">{place.name}</h2>
        <p className="te-subtitle">
          {status === 'ready' && places.length > 0 && (
            <span>
              <strong>{places.length}</strong> {category.label.toLowerCase()} within {radiusKm} km
            </span>
          )}
          {localTime(place.timezone) && <span>{localTime(place.timezone)} local time</span>}
        </p>
      </header>

      <div className="te-chips" role="group" aria-label="Categories">
        {CHIP_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`te-chip${c.id === category.id ? ' is-active' : ''}`}
            aria-pressed={c.id === category.id}
            onClick={() => setCategory(c)}
          >
            {c.chip || c.label}
          </button>
        ))}
        {!CHIP_CATEGORIES.some((c) => c.id === category.id) && (
          <button className="te-chip is-active" aria-pressed="true">
            {category.label}
          </button>
        )}
      </div>

      {body}

      <footer className="te-footer">Places © OpenStreetMap via Geoapify · Descriptions from Wikipedia</footer>
    </>
  )
}

export default TourismExplorer

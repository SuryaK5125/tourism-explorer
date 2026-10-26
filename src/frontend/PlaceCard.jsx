import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import { getPlaceKind } from './placeKind'
import { formatDistance } from './placesApi'

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text)

// One attraction as a compact row. Click the row to expand details and links.
function PlaceCard({ place, index, featured, inPlan, onTogglePlan, active, onSelect }) {
  const [expanded, setExpanded] = useState(false)
  const { label, Icon } = getPlaceKind(place.categories)
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`
  // Wikidata's one-liner is ideal ("skyscraper in Manhattan"), unless it's just a type ("museum")
  const usefulSummary = place.summary && place.summary.split(' ').length >= 3 ? place.summary : null
  const blurb = capitalize(usefulSummary || place.description || place.summary)

  return (
    <article
      className={`te-row${featured ? ' te-row--featured' : ''}${place.image ? ' has-photo' : ''}${active ? ' is-active' : ''}${expanded ? ' is-open' : ''}`}
      style={{ '--i': index }}
      onMouseEnter={() => onSelect?.(place.id)}
    >
      <button
        className="te-row__main"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${place.name}, ${label}. ${expanded ? 'Hide' : 'Show'} details`}
      >
        <div className="te-thumb">
          {place.image ? (
            <img src={place.image} alt="" loading="lazy" />
          ) : (
            <Icon className="te-thumb__icon" aria-hidden="true" />
          )}
          <span className="te-thumb__num">{index + 1}</span>
        </div>

        <div className="te-row__text">
          <h3 className="te-row__name">{place.name}</h3>
          <p className="te-row__meta">
            {label}
            {place.distance != null && <> · {formatDistance(place.distance / 1000)}</>}
          </p>
          {blurb && <p className="te-row__blurb">{blurb}</p>}
        </div>
      </button>

      <button
        className={`te-plan-toggle${inPlan ? ' is-on' : ''}`}
        onClick={() => onTogglePlan(place.id)}
        aria-pressed={inPlan}
        title={inPlan ? 'Remove from day plan' : 'Add to day plan'}
      >
        {inPlan ? <CheckIcon fontSize="inherit" /> : <AddIcon fontSize="inherit" />}
      </button>

      {expanded && (
        <div className="te-row__details">
          {place.description && blurb !== place.description && <p className="te-row__desc">{place.description}</p>}
          {(place.address || place.localName) && (
            <p className="te-row__address">{[place.localName, place.address].filter(Boolean).join(' · ')}</p>
          )}
          <div className="te-row__links">
            <a href={directionsUrl} target="_blank" rel="noreferrer">
              Directions
            </a>
            {place.wikiUrl && (
              <a href={place.wikiUrl} target="_blank" rel="noreferrer">
                Wikipedia
              </a>
            )}
            {place.website && (
              <a href={place.website} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

export default PlaceCard

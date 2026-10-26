import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Tiles come through our backend (/api/tiles), which adds the Geoapify key server-side
const ATTRIBUTION = 'Powered by Geoapify | &copy; OpenStreetMap contributors'

// Plain Leaflet inside a ref: the map is created once, markers are redrawn when places change.
// `route` is the day plan in visiting order; it is drawn as a dashed line from the centre.
function MapView({ apiUrl, center, places, route = [], fitRoute = false, mode, activeId, onSelect, height }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileRef = useRef(null)
  const markersRef = useRef(L.layerGroup())

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    map.setView([center.lat, center.lon], 13)
    map.attributionControl.setPrefix(false)
    markersRef.current.addTo(map)
    mapRef.current = map
    return () => map.remove()
  }, [center.lat, center.lon])

  useEffect(() => {
    tileRef.current?.remove()
    tileRef.current = L.tileLayer(`${apiUrl}/api/tiles/${mode}/{z}/{x}/{y}.png`, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
    }).addTo(mapRef.current)
  }, [apiUrl, mode, center.lat, center.lon])

  useEffect(() => {
    const group = markersRef.current
    group.clearLayers()
    const planIds = new Set(route.map((p) => p.id))

    if (route.length) {
      L.polyline([[center.lat, center.lon], ...route.map((p) => [p.lat, p.lon])], {
        className: 'te-route',
        weight: 2.5,
        dashArray: '4 6',
        interactive: false,
      }).addTo(group)
    }

    L.marker([center.lat, center.lon], {
      icon: L.divIcon({ className: 'te-pin te-pin--center', iconSize: [14, 14] }),
      title: 'City centre',
      interactive: false,
    }).addTo(group)

    // Planned stops (and the hovered place) are numbered pins; everything else is a small dot
    places.forEach((place, i) => {
      const planned = planIds.has(place.id)
      const active = place.id === activeId
      const numbered = planned || active
      const classes = ['te-pin', planned && 'is-planned', active && 'is-active', !numbered && 'te-pin--dot']
      L.marker([place.lat, place.lon], {
        icon: L.divIcon({
          className: classes.filter(Boolean).join(' '),
          html: numbered ? String(i + 1) : '',
          iconSize: numbered ? [24, 24] : [10, 10],
        }),
        title: place.name,
        zIndexOffset: active ? 1000 : planned ? 500 : 0,
      })
        .on('click', () => onSelect(place.id))
        .bindTooltip(place.name, { direction: 'top', offset: [0, -10] })
        .addTo(group)
    })
  }, [places, route, activeId, center.lat, center.lon, onSelect])

  // Re-frame only when the places (or the route, for the day-plan map) change, not on hover
  const framed = fitRoute && route.length ? route : places
  useEffect(() => {
    if (!framed.length) return
    const bounds = L.latLngBounds(framed.map((p) => [p.lat, p.lon]).concat([[center.lat, center.lon]]))
    mapRef.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 })
  }, [framed, center.lat, center.lon])

  return <div ref={containerRef} className="te-map" style={{ height }} />
}

export default MapView

# Tourism Explorer: a hyperDart travel field guide

Ask *"things to do in Paris"*, *"museums in Delhi"* or *"temples in Kurukshetra"* and get a compact,
editorial-style guide to what is actually worth seeing there. You get ranked real attractions, a map, and a
mini day plan you can edit. Built as a standalone hyperDart component (React + Vite + Hono on Cloudflare Workers).

## The idea

Search results for travel questions usually link out to long articles. Tourism Explorer answers at a glance.
The first card is the place's **must-see** sight, followed by a numbered shortlist. You can then dig deeper by
switching category, opening the map, or building a day plan.

Design choices:

- **Restrained design system.**
  - One typeface (Inter) and one accent colour (teal) on neutral surfaces.
  - A 4px spacing grid and two corner radii.
  - Teal means exactly one thing: what's in your day plan. That covers the + toggles, the map pins, the dashed route and the timeline dots.
- **Answer first, details on demand.** The header says how many places are worth seeing and within what radius.
  - Each result is a compact row: photo, name, type and distance, plus a one-line description.
  - Clicking a row expands the full Wikipedia intro, address and links.
- **Honest content.** Photos come only from the place's Wikipedia article, with logos, maps and diagrams filtered out.
  Places without a photo get a neutral category icon. Descriptions are English-only, and nothing is invented.
- **Two layouts from one component.** In the **sidebar** (≤420px) the content sits behind *Guide · Map · Day plan* tabs.
  In **mainline** (720px) the list and a sticky map plus day plan sit side by side. Layout follows
  `props.format`, with a width fallback (ResizeObserver) in case the frame is simply narrow.
- **Light & dark** follow the hyperDart theme (`useTheme().palette.mode` from the MUI theme `withHD` provides),
  including dark map tiles.

## Features

| Feature | How |
|---|---|
| Attractions in a city | Location entity from `searchData` → `/api/places` → Geoapify Places |
| Category requests (museums, temples, forts, monuments, historic sites, parks, viewpoints, landmarks) | Keyword patterns on the query (`src/frontend/searchParsing.js`), plus category chips |
| Place details | Name (English first, local name below), type, distance from centre, address, Wikidata one-liner, Wikipedia intro + photo |
| Filtering out restaurants / hotels / shops | Server-side category whitelist + exclusion of `catering`, `accommodation`, `commercial`, … |
| Notable places first | Ranking by Wikipedia/Wikidata presence, heritage/landmark category, then distance |
| Small towns | If fewer than 5 results within 5 km, the search widens to 25 km automatically |
| Map | Leaflet with numbered pins synced to the list. Tiles are proxied through the backend so the key stays private |
| Mini day itinerary | Pick places ("Add to day"). They're ordered nearest-next from the centre, with walk/ride legs, estimated times and visit lengths |
| Robust states | Loading skeleton, "no place found" message, empty results (with "show top sights instead"), API failure with retry, 15 s timeout |

## Architecture and data flow

```
hyperDart search ──► props.searchData (+ format, theme, deployedBackendURL)
        │
        ▼
src/frontend/searchParsing.js   normalizeSearchData(): array|object → { place{lat,lon,name}, category }
        │
        ▼
src/frontend/TourismExplorer.jsx   state: category, status, places, plan
        │  fetchPlaces()  (src/frontend/placesApi.js)
        ▼
GET {API_URL}/api/places?lat&lon&category        ◄── Hono on Cloudflare Workers (src/backend/index.js)
        │   1. validate lat/lon + category (400 on bad input)
        │   2. Geoapify Places, one request (≤20) per category group, circle 5 km → 25 km if sparse
        │   3. drop non-sights, de-duplicate, rank, keep top 20
        │   4. Wikidata (1 batched call) + Wikipedia summaries for top 10 (optional, failures logged)
        ▼
{ places: [...], meta: { category, radius, count } }
        │
        ▼
PlaceCard · MapView (tiles via /api/tiles/:style/:z/:x/:y) · DayPlan · StatusMessage
```

`API_URL` follows the template pattern: `props.deployedBackendURL` in production, `VITE_API_URL` in development.

### Files

| File | Purpose |
|---|---|
| `src/frontend/index.jsx` | Template entry, wraps the component with `withHD` |
| `src/frontend/TourismExplorer.jsx` | Top-level component: fetching, states, sidebar/mainline layout |
| `src/frontend/searchParsing.js` | searchData normalisation + category detection (**add query patterns here**) |
| `src/frontend/placesApi.js` | Backend client, typed errors, distance helpers |
| `src/frontend/PlaceCard.jsx` | One attraction |
| `src/frontend/MapView.jsx` | Leaflet map with numbered pins |
| `src/frontend/DayPlan.jsx` | Nearest-neighbour itinerary with time estimates |
| `src/frontend/placeKind.jsx` | Geoapify category → readable label + icon |
| `src/frontend/StatusMessage.jsx` | Loading / empty / error views |
| `src/frontend/explorer.css` | All styling (theme tokens at the top) |
| `src/backend/index.js` | Hono routes `/api/places`, `/api/tiles/...` |
| `src/backend/proxy/worker.js` | Separately deployed Worker that holds the Geoapify key as a Cloudflare secret |

### Adding a new query pattern (example)

1. Add a category in `CATEGORIES` in `src/frontend/searchParsing.js`, e.g.
   `{ id: 'beaches', label: 'Beaches', pattern: /\bbeach(es)?\b/i }`
2. Add the same id to `CATEGORY_MAP` in `src/backend/index.js`, e.g. `beaches: ['beach,natural.coastal']`
3. Optionally add `beaches?` to the second regex in `hyperdart.config.js` so the query triggers the component.

## API key handling

- The Geoapify key is **never in frontend code or git**. Locally it lives in `src/backend/.dev.vars` (gitignored),
  which `wrangler dev` reads into `c.env.GEOAPIFY_API_KEY`.
- Map tiles are also fetched through the backend (`/api/tiles`), because a tile URL would otherwise expose the key.
- hyperDart's docs describe no runtime secret store: deployed backend config comes from `dist/backend/wrangler.jsonc`,
  which is part of the published package. So in production the key lives in a **separate Cloudflare Worker**
  (`src/backend/proxy/worker.js`, config `wrangler.proxy.jsonc`), stored as a Cloudflare secret
  (`wrangler secret put`). It only forwards `GET /v2/places` and `GET /v1/tile/...` to Geoapify and adds the key.
- The published hyperDart backend only knows the proxy's URL (`GEOAPIFY_PROXY_URL` in `wrangler.jsonc`, not a secret).
  The key never appears in git, the frontend bundle or the npm package.
- If neither the key nor the proxy URL is set, the backend answers `NOT_CONFIGURED` and the UI shows its error state.

```
browser ─► hyperDart backend (/api/places, /api/tiles) ─► proxy Worker (+ key secret) ─► Geoapify
```

Deploy the proxy (once, from `src/backend`):

```bash
npx wrangler deploy -c wrangler.proxy.jsonc
npx wrangler secret put GEOAPIFY_API_KEY -c wrangler.proxy.jsonc
```

Then set `GEOAPIFY_PROXY_URL` in `src/backend/wrangler.jsonc` to the printed `https://….workers.dev` URL.

## Data sources

- [Geoapify Places API](https://apidocs.geoapify.com/docs/places/): attractions (OpenStreetMap data)
- [Geoapify Map Tiles](https://apidocs.geoapify.com/docs/maps/map-tiles/): `osm-bright-smooth` / `dark-matter-brown`
- [Wikidata](https://www.wikidata.org/) `wbgetentities`: short descriptions and English article titles
- [Wikipedia REST summary API](https://en.wikipedia.org/api/rest_v1/): descriptions and photos

## Libraries

React 19, MUI 6 (icons + theme from the template), Leaflet 1.9, Hono 4, Vite 6, Wrangler 4 (all from the
official `create-hyper-dart` React + Vite + Hono template, plus Leaflet).

## Running locally

```bash
npm install
cd src/backend && npm install
echo GEOAPIFY_API_KEY=your_key > .dev.vars
npm start            # backend on http://127.0.0.1:3001
# in another terminal, project root:
npm start            # sandbox on http://localhost:5173 → search "museums in Delhi"
```

## Build and publish

Set `github` and `demovideo` in `hyperdart.config.js` first; the validator requires both.

```bash
npm run build                      # frontend → dist/frontend
cd src/backend && npm run build    # backend → dist/backend (key-free)
cd ../.. && npm publish            # runs scripts/validate-publish.js first
```

## AI Tool disclosure

Tourism Explorer was developed using **Claude Code (Anthropic)** as an AI-assisted development tool, based on the official `create-hyper-dart` React, Vite and Hono template.

Claude Code assisted substantially with frontend implementation, backend API development, search parsing, itinerary functionality, debugging and testing.

As the solo developer, I was responsible for:

- Defining the project scope, requirements and design direction.
- Guiding implementation priorities and technical decisions.
- Reviewing and testing the application across multiple destinations.
- Refining the user experience, responsive layouts and visual design.
- Identifying and addressing issues with attraction results, API handling and data quality.
- Ensuring secure API key management through a separate Cloudflare Worker.

AI assistance was used throughout development, while project decisions, evaluation and final submission remained my responsibility.
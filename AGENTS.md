# HyperDart Standalone Component — react+vite+hono

Guide for AI assistants working inside this project. Explains the mandatory folder
structure, config files, backend (Hono on Cloudflare Workers), props injected
by the hyperDart platform, routing rules, and the build/sandbox workflow — so the
AI never breaks conventions when generating or editing component code.

Full docs: https://hyperdart.com/docs/docs/intro

---

## 1. What is a HyperDart Standalone Component?

A **standalone component** is a self-contained React app that is:
- Bundled as a UMD/ES module and published to the **hyperDart** search platform.
- Loaded inside an **iframe** (called a *Dart Frame*) by the platform.
- Triggered when a user's search query matches the component's `keywords` or `regex` patterns.
- Backed by a **Hono server running on Cloudflare Workers** (this template).
- Passed a rich `props` object by the platform at runtime.

---

## 2. Mandatory Folder Structure

**Do NOT rename, move, or delete any of the following files/folders.**

```
<project-root>/
├── src/
│   ├── frontend/                  ← React component lives here
│   │   ├── index.jsx              ← Entry point; wraps component with withHD HOC
│   │   └── NewComponent.jsx       ← Your main React component (rename freely)
│   ├── backend/                   ← Hono server (Cloudflare Workers)
│   │   ├── index.js               ← Hono app entry point (export default app)
│   │   ├── esbuild.config.js      ← Backend bundler config — DO NOT modify
│   │   ├── package.json           ← Backend-specific deps
│   │   ├── schema.jsonc           ← D1 database schema (optional)
│   │   └── wrangler.jsonc         ← Cloudflare Workers config
│   └── sandbox/                   ← Local dev sandbox — DO NOT modify
│       ├── main.jsx
│       └── index.css
├── scripts/
│   └── validate-publish.js        ← Pre-publish validation — DO NOT modify
├── hyperdart.config.js             ← Platform config (keywords, formats, backend)
├── searchData.json                 ← Mock data for local sandbox
├── resource.json                   ← Query schema for platform AI
├── RESOURCE.md                     ← Docs for resource.json
├── vite.config.js                  ← Build config — DO NOT modify
├── index.html                      ← Sandbox HTML shell — DO NOT modify
└── package.json
```

### Rules for `src/frontend/`

- `index.jsx` **must** export the component wrapped with `withHD`:
  ```jsx
  import NewComponent from "./NewComponent";
  import { withHD } from '@hyperdart/frontend';
  export default withHD(NewComponent);
  ```
- You **may** rename `NewComponent.jsx` and add sub-components inside `src/frontend/`.
- **Do not** add a `BrowserRouter` — `withHD` already provides one.

### Rules for `src/backend/`

- `index.js` is a **Hono** app. The file **must end with** `export default app`.
- Add new routes via `app.get(...)`, `app.post(...)`, etc. following the existing pattern.
- **Do not change** the CORS middleware or remove the `DEV_DOMAIN`/`STAGING_DOMAIN`/`PROD_DOMAIN` env references.
- Database access uses **Cloudflare D1** via `c.env.DB` (see commented examples).
- `esbuild.config.js` bundles the backend — **do not modify it**.

---

## 3. Config Files

### `hyperdart.config.js`

```js
export default {
  name: pkg.name,
  triggers: {
    keywords: ['keyword1', 'keyword2']
  },
  query_format: {
    regex: ['pattern1', 'pattern2']
  },
  server: {
    location: 'dist/backend/index.js',
    configPath: 'dist/backend/wrangler.jsonc',
    schemaPath: 'dist/backend/schema.jsonc'
  },
  client: {
    location: pkg.module,
    moduleName: pkg.umdName || 'HD' + pkg.name,
    baseURL: '/' + pkg.name,
  },
  format: {
    mainline: true,
    sidebar: true
  },
  permissions: {},
  info: {}
}
```

**Only edit:** `triggers.keywords`, `query_format.regex`, `format`, `permissions`, `info`.  
**Never change:** `name`, `server.*`, `client.location`, `client.moduleName`.

### `src/backend/wrangler.jsonc`

Cloudflare Workers config. Important fields:

| Field | Purpose |
|-------|---------|
| `vars.DEV_DOMAIN` | Injected at runtime after publish — keep empty locally |
| `vars.STAGING_DOMAIN` | Same — injected by platform |
| `vars.PROD_DOMAIN` | Same — injected by platform |
| `vars.ENVIRONMENT` | `"development"` locally |
| `d1_databases` | Uncomment to add a D1 database binding |

**Do not remove** `DEV_DOMAIN`, `STAGING_DOMAIN`, or `PROD_DOMAIN` — required in CORS config.

### `searchData.json`

Mock search data for local sandbox only — never use in component logic.

### `resource.json`

**Optional.** Defines a structured query schema to help the platform AI understand
what data your component needs. Editing this is optional — you only need to
customize it if you want finer control over how the platform parses search queries
for your component. See `RESOURCE.md` for field documentation.

---

## 4. Backend API URL Pattern

In `NewComponent.jsx`, the API URL is resolved like this:

```jsx
const API_URL =
  process.env.NODE_ENV === 'production'
    ? props.deployedBackendURL ?? ''
    : import.meta.env.VITE_API_URL;
```

- **Local dev:** set `VITE_API_URL` in `.env` (e.g. `http://localhost:3001`).
- **Production:** `props.deployedBackendURL` is injected by the platform after publish.
- **Never hardcode** a production API URL.

### Hono Route Pattern

```js
// GET with JSON response
app.get('/api/message', (c) =>
  c.json({ message: 'Hello from Hono on Workers!' })
)

// GET with route params and env access
app.get('/api/hello/:name', (c) => {
  const env = c.env.ENVIRONMENT
  return c.json({ message: `Hello, ${c.req.param('name')} ${env}` })
})
```

---

## 5. How Triggering Works

When a user's search query matches one of your component's `keywords` or `query_format.regex` patterns (defined in `hyperdart.config.js`), the platform:

1. Activates your component inside a Dart Frame.
2. Parses the search query and injects structured data as `props.searchData`.
3. Passes the full `props` object to your root component.

`props.searchData` is the primary data prop — it contains the matched/parsed search results the platform has resolved for your component based on the query.

---

## 6. Props Injected by the Platform

### 6.1 `props.messageHandlers`

| Method | When to call |
|--------|-------------|
| `props.messageHandlers.componentLoaded()` | **Required.** Call once when UI is fully ready (after data fetched). Top-level component only. |

### 6.2 `props.searchData`

The primary data prop. Contains the structured search results resolved by the platform
when the user's query matched your component's keywords or regex patterns.

```js
props.searchData  // array or object of resolved search results
```

Use this as your main data source for rendering content.

### 6.3 `props.queryProps`

Structured query data matching your `resource.json` schema — use this to
drive fetches and rendering (only relevant if you've configured `resource.json`).

### 6.4 `props.deployedBackendURL`

The live URL of your published Hono worker — use this for API calls in production.

### 6.5 Other props

| Prop | Description |
|------|-------------|
| `props.searchQuery` | Raw user search string |
| `props.format` | `"mainline"` or `"sidebar"` |
| `props.theme` | Platform theme object |

---

## 6. Routing

`withHD` provides a `BrowserRouter`. **Do NOT add another `<BrowserRouter>`.**

```jsx
import { Routes, Route } from 'react-router-dom';

function MyComponent(props) {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/details/:id" element={<DetailsPage />} />
    </Routes>
  );
}
```

---

## 7. Mainline vs Sidebar

| Context | `props.format` | Typical width |
|---------|---------------|---------------|
| Mainline | `"mainline"` | Full width |
| Sidebar | `"sidebar"` | ~320–400 px |

Use `props.format` to switch between compact and full layouts.

---

## 8. Development Workflow

```bash
# Install frontend deps
npm install

# Install backend deps
cd src/backend && npm install && cd ../..

# Start frontend sandbox (port 5173)
npm run dev

# Start Hono worker locally (port 3001, separate terminal)
cd src/backend && npx wrangler dev

# Build everything
npm run build

# Validate before publish
npm run validate
```

---

## 9. AI Generation Rules

1. **Never change** `src/sandbox/`, `vite.config.js`, `index.html`, `scripts/`, or `src/backend/esbuild.config.js`.
2. **Always keep** `withHD` wrapping in `src/frontend/index.jsx`.
3. **Never add** a second `<BrowserRouter>`.
4. New frontend sub-components go in `src/frontend/`.
5. New backend routes go in `src/backend/index.js` using Hono's `app.get/post/put/delete`.
6. Hono `index.js` **must** end with `export default app`.
7. Use `props.queryProps` to drive data — never hardcode search-dependent values.
8. Use the `API_URL` pattern from §4 for all backend calls — never hardcode URLs.
9. `hyperdart.config.js` `server.*`, `client.location`, and `client.moduleName` are **read-only**.
10. Do not remove `DEV_DOMAIN`, `STAGING_DOMAIN`, or `PROD_DOMAIN` from CORS config or `wrangler.jsonc`.
11. In Hono, access env vars via `c.env.VAR_NAME` (not `process.env`).

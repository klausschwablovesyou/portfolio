# Tibor Németh — CV and portfolio site

A one-page, scrollable CV and portfolio in English and Hungarian, with an animated three.js
background. The site is built with Astro as static files and served by a small Danet (Deno) backend.

```
.
├── deno.json            root tasks: build the site, then serve it
├── Dockerfile           two-stage image: build the site, run the backend
├── docker-compose.yml   runs the image on port 3000
├── site/                Astro site (static output) + three.js scene
└── backend/             Danet server: serves site/dist, picks the language for "/"
```

## Requirements

- Node.js 22.23 or newer (for Astro; developed on Node 25)
- Deno 2

Or only Docker with Compose, see [Docker](#docker).

## Quick start

```sh
cd site && npm install && cd ..
deno task start        # builds site/dist, then serves it on http://localhost:3000
```

`PORT` changes the port (default `3000`).

## Development

Front end, with hot reload (no backend needed):

```sh
cd site
npm run dev            # astro dev; with Astro 7 it runs in the background, stop it with `npx astro dev stop`
npm run check          # astro check (types + .astro files)
npm run build          # writes site/dist
```

Open `/en/` or `/hu/` directly: in dev, `/` is the static fallback page, which redirects in the browser.

Backend:

```sh
cd backend
deno task dev          # serve site/dist with --watch
deno task serve        # build the site, then start
deno task test         # unit tests
deno task check        # type check
```

The backend exits at startup if `site/dist` has not been built.

### Environment variables

| Variable    | Default         | Meaning                                                         |
|-------------|-----------------|-----------------------------------------------------------------|
| `PORT`      | `3000`          | Port the backend listens on                                     |
| `SITE_DIST` | `../site/dist`  | Built site to serve; relative paths resolve from `backend/`     |

## How it works

### Routing and languages

- `GET /` → `302` to `/en/` or `/hu/`. The `lang` cookie (set by the site's language switch) wins,
  then `Accept-Language`, then English (`backend/src/locale/`).
- `GET /api/health` → `{ "status": "ok", "uptime": <seconds> }`.
- Anything else is a static file from `site/dist`, or `404.html` with status 404.

Without the backend (any static host), `site/src/pages/index.astro` does the same choice in the
browser and shows plain language links when JavaScript is off.

All text lives in `site/src/i18n/`: `en.ts` and `hu.ts` implement `SiteContent` from `types.ts`;
values shared by both languages (contact details, years, stacks) are in `shared.ts`. To add a
language, add a content file, register it in `site/src/i18n/index.ts`, and add its code to
`SUPPORTED_LOCALES` in `backend/src/config.ts`.

### Headers

Every response gets cache and security headers (`backend/src/http/headers.ts`):

- `/_astro/*` is cached as immutable, HTML is `no-cache`, errors are `no-store`.
- HTML responses carry a strict Content-Security-Policy. Inline scripts are allowed by their
  SHA-256 hashes, computed from the built HTML at startup, so **restart the backend after every
  rebuild**.
- Text responses are compressed.

### The 3D scene

`site/src/scripts/scene/` draws two layers on one WebGL canvas, loaded on idle after the text:

- **Background** (`cosmos/`): gas and dust sky, an endless star field with parallax, a ringed
  planet, a turning satellite and occasional shooting stars.
- **Anchored objects**, tied to elements of the page: the career drawn as a git graph in the hero
  (`graph.ts`) and a spinning shuriken (`shuriken.ts`).
- **Post-processing** (`post.ts`): depth of field, bloom, lens effects and grain.

Quality steps down on its own when frames get slow. `?fx=0|1|2` pins a step (0 = no
post-processing). With `prefers-reduced-motion` the scene renders a still frame. The page is fully
readable without JavaScript or WebGL.

`site/plan.md` is the original design brief and lists the design revisions and the reasons behind
them.

## Docker

```sh
docker compose up -d --build   # build the image and start it on http://localhost:3000
docker compose logs -f         # follow the logs
docker compose down            # stop and remove the container
```

`HOST_PORT` changes the port on the host (default `3000`), e.g. `HOST_PORT=8080 docker compose up -d`.
Inside the container the backend always listens on `3000`.

The `Dockerfile` has two stages:

1. `node:24-alpine` installs the site's dependencies with `npm ci` and builds `site/dist`.
2. `denoland/deno` caches the backend's dependencies, copies in `site/dist` and runs the server
   as the unprivileged `deno` user, with `--cached-only` so nothing is downloaded at runtime.

Only `site/` and `backend/` go into the build context (`.dockerignore`); local `node_modules`,
`dist` and `.env` files are left out. Compose restarts the container unless it was stopped by hand
and marks it unhealthy if `/api/health` stops answering.

The image does not handle TLS: put it behind a reverse proxy (Caddy, nginx, Traefik) for HTTPS.

## Deployment

With Docker, see above. Without it, on any machine with Deno and Node:

```sh
deno task build                     # or: cd site && npm ci && npm run build
cd backend && PORT=8080 deno task start
```

The backend needs `--allow-net --allow-read --allow-env` (already in the task). `site/dist` can
also be put on any static host on its own; then the in-browser fallback picks the language and the
security headers have to come from the host.

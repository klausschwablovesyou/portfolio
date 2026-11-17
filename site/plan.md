# Implementation plan: multilingual CV + portfolio website

This is a brief for whoever implements the site. It assumes you have not seen the conversation that produced it. Nothing is implemented yet: only dependencies are installed (see "Current state").

Written 2026-11-12. The site has since been built, and its look was revised the same day: section 16 lists what replaced the visuals described in sections 7 to 10. Where they disagree, section 16 and the code win.

## 1. Goal

Build a one-page, scrollable CV and portfolio website for Tibor Németh, a full stack software architect, in English and Hungarian.

The owner asked for a site that is **modern, spectacular, animated, with parallax, responsive, and with a few 3D elements made with three.js**. The audience is recruiters, hiring managers and technical leads, so the visual show must never get in the way of reading the CV.

Fixed technology choices (the owner's, not negotiable):

- **`site/`**: AstroJS, static output.
- **`backend/`**: the Danet framework (Deno). Danet is the web server: it serves the built Astro site.
- **3D**: three.js.

Out of scope: CMS, admin UI, database, contact form.

Done means: `npm run build` in `site/` succeeds, `deno task start` in `backend/` serves the result on one port, both languages render correctly at phone, tablet and desktop widths, and the checks in section 14 pass.

## 2. Current state

Project root: `/Users/megant/Works/cv`. It is not a git repository.

Already present:

- `site/package.json`, `site/package-lock.json`, `site/node_modules` with `astro`, `three`, `@types/three`, `typescript`, `@astrojs/check` and three Fontsource variable fonts.
- `backend/deno.json` (only an import map entry for Danet so far) and `backend/deno.lock`.

No source code exists in either folder. Do not touch the other files in the project root; they belong to the PDF CV workflow.

Versions verified on this machine:

| Tool | Version | Note |
|---|---|---|
| Node | 25.8.1 | Astro 7 requires at least 22.23.4 |
| Astro | 7.4.11 | built on Vite 8 / Rolldown |
| three | 0.187.0 | |
| Deno | 2.9.7 | |
| Danet | `jsr:@danet/core@2.12.0` | built on Hono 4.6.3 |
| Fonts | `@fontsource-variable/archivo`, `@fontsource-variable/source-serif-4`, `@fontsource-variable/jetbrains-mono` | include latin-ext, needed for ő and ű |

Astro 7 is recent. Check its behaviour against the installed package (`site/node_modules/astro`, config types in `dist/types/public/config.d.ts`) instead of relying on memory of older versions.

## 3. Content sources and rules

The owner named two sources for the text. Read both in full before writing content.

- **`/Users/megant/Works/cv/cv-onepage.html`**: the polished one-page CV. It is the primary source for English wording (pitch, experience bullets, skill groups, headline numbers, the stack timeline data) and for the visual identity (colours, type).
- **`/Users/megant/Works/cv/Profile.pdf`**: the LinkedIn export, 8 pages. It supplies details the one-pager leaves out: the technology list of every role, the 2003–2013 positions, and the headline "Full Stack Software Architect, and Ninja of course".

Supporting files:

- `/Users/megant/Works/cv/linkedin_profile.md` is a text snapshot of the same LinkedIn profile, easier to read than the PDF, with a list of its known typos. **Never fetch the live LinkedIn page**; it blocks automated requests and the owner asked for the snapshot to be used.
- `/Users/megant/Works/cv/profile-photo.jpg` (1463×1672): the portrait. The face is centred in the upper half; for a circular or square crop use roughly `object-position: 50% 22%`, as the CV does.
- `/Users/megant/Works/cv/Tibor_Nemeth_CV_OnePage.pdf`: the downloadable CV (English only).

Rules:

1. Publish only facts that appear in the sources. Do not invent projects, numbers, clients, testimonials or screenshots. There are no project screenshots, so portfolio cards are typographic.
2. Where the LinkedIn export and the one-pager disagree, the one-pager wins. It already fixes the export's errors: "Sonarworks" is SonarQube, "CareDX" is CareDx, "CfDNA" is cfDNA, and ended roles are in the past tense (the CareDx role ended in July 2026).
3. Leave out the age ("46 years old"). It is stale and does not belong on the site.
4. The Hungarian text does not exist in any source; you translate it. The owner will proofread it, so say in your final report that it needs review.
5. Name order: "Tibor Németh" in English, "Németh Tibor" in Hungarian.
6. Hungarian copy avoids addressing the reader directly, so it needs neither the informal nor the formal register. For example, write "Közvetlenül is elérhető vagyok" instead of "Keressen bátran".
7. Keep technology and product names and established developer terms in English in the Hungarian text (workspace, pipeline, code review, story mapping, PWA). Use a real en dash with spaces for Hungarian parenthetical dashes.

## 4. Architecture

```
browser ──HTTP──▶ Danet (Deno, :3000)
                    ├─ GET /            → 302 to /en/ or /hu/ (cookie, then Accept-Language)
                    ├─ GET /api/health  → JSON
                    └─ everything else  → static file from site/dist
                                           (no match → dist/404.html with status 404)

site/src ──astro build──▶ site/dist  (HTML, CSS, JS, images, fonts)
```

Astro builds a fully static site with no server rendering, so `dist` would also work on any static host. Danet adds language negotiation, cache and security headers, compression and the 404 page. During development `astro dev` gives hot reload; Danet always serves the finished build.

## 5. Folder layout

A proposal. Adjust names if something reads better, but keep the split between content, components, scripts and styles.

```
site/
  plan.md                   # this file
  astro.config.mjs          # static output, i18n: en + hu, both prefixed
  tsconfig.json
  public/
    favicon.svg             # TN monogram; the outline path is in cv-onepage.html (.portrait svg)
    Tibor_Nemeth_CV.pdf     # copy of Tibor_Nemeth_CV_OnePage.pdf
  src/
    assets/profile-photo.jpg
    i18n/
      types.ts              # SiteContent type that both languages must satisfy
      shared.ts             # language-independent data: dates, stack spans, contact details, tech tags
      en.ts
      hu.ts
      index.ts              # getContent(lang), locale list, URL helpers
    layouts/Base.astro      # <head>, hreflang, fonts, canvas, nav, footer
    pages/
      index.astro           # fallback redirect for hosting without Danet
      [lang]/index.astro    # the whole page; getStaticPaths → en, hu
      404.astro
    components/
      Nav.astro  Hero.astro  Stats.astro  About.astro  Stacks.astro
      Experience.astro  Work.astro  Skills.astro  Earlier.astro  Contact.astro  Footer.astro
    scripts/
      scene/                # three.js: index.ts, tower.ts, field.ts, shuriken.ts, anchors.ts
      motion.ts             # reveals, parallax, counters, timeline, card tilt
      nav.ts                # active section, progress bar, language switch
    styles/
      tokens.css  base.css  sections.css

backend/
  deno.json                 # imports, tasks, decorator compiler options
  src/
    main.ts                 # bootstrap: middleware, module, static assets, 404
    app.module.ts
    config.ts               # PORT, SITE_DIST, supported locales
    locale/
      locale.controller.ts  # GET /
      locale.service.ts     # cookie + Accept-Language → locale
    health/health.controller.ts
    http/headers.ts         # cache and security headers
  tests/locale.service_test.ts
```

## 6. Internationalisation

- **Routes:** `/en/` and `/hu/`, both with a prefix. One `[lang]/index.astro` page generates both through `getStaticPaths`.
- **Content:** one TypeScript object per language (`en.ts`, `hu.ts`) typed as `SiteContent`. A key missing from either language then fails the build, so nothing ships untranslated.
- **Language-independent data** (years, technology names, phone number) lives once, in `shared.ts`.
- **Root `/`:** Danet decides. Order: the `lang` cookie, then the `Accept-Language` header, then English. Respond with 302 and `Vary: Accept-Language, Cookie`. `src/pages/index.astro` is a static fallback for hosting without Danet: a small page that redirects by `navigator.language` and has plain links to both languages.
- **Language switch:** `EN | HU` in the nav. On click it sets the `lang` cookie and keeps the current section (`/hu/#experience`).
- **SEO:** `<html lang>`, a title and description per language, and `link rel="alternate" hreflang` for `en`, `hu` and `x-default`.
- **Adding a language** should take one new content file plus one entry in the locale list (frontend and backend).

Not yet tested: how Astro 7's `i18n` config behaves alongside a hand-written `src/pages/index.astro`. If the built-in routing fights it, set `redirectToDefaultLocale: false`, or drop the `i18n` config and rely on the `[lang]` route alone.

## 7. Page structure

Dark and light sections alternate. Dark sections are transparent, so the fixed 3D canvas shows through them; light sections are opaque and slide over the scene. That contrast is the main parallax effect of the page.

| # | Section | Background | Content | Source |
|---|---|---|---|---|
| 0 | Nav | – | TN monogram, section links, language switch, scroll progress bar | – |
| 1 | Hero | dark | status pill, name, role, `// and Ninja, of course`, pitch, two buttons; 3D stack tower | one-pager + Profile |
| 2 | Stats | dark | 23 / 6 / 3 / 11, counting up | one-pager |
| 3 | About | light | portrait, intro paragraph, the "favourite boss" quote, leadership strengths, languages | both |
| 4 | Six stacks in 23 years | dark | timeline chart 2003–2026 and the level band: Junior → Developer → Senior · Lead → Architect | one-pager |
| 5 | Experience | light | six roles, 2013–2026, on a timeline that fills as you scroll | one-pager |
| 6 | Selected work | dark | eight project cards (below) | Profile + one-pager |
| 7 | Skills | light | five skill groups and a running marquee of technologies | one-pager |
| 8 | Earlier · 2003–2013 | light | seven-row ledger | one-pager |
| 9 | Contact | dark | phone (Signal), email, LinkedIn, location · CET, CV download; 3D shuriken | both |
| 10 | Footer | dark | name, year, "Astro · three.js · Danet" | – |

Take the hero pitch, status line, stats, experience entries, skill groups, leadership list, languages, ledger and quote from `cv-onepage.html` as written.

### New copy

Two pieces of English text are not in the sources verbatim. Use these; every claim in them is supported by the sources.

About paragraph:

> Full stack senior developer and architect from Hungary, building for the web since 2003. I started with Flash and PHP and moved through .NET to TypeScript, Angular and Java Spring: six stacks in 23 years. For the last six years I have worked as an architect and team lead, designing the system, leading an international team, reviewing code and mentoring, while still shipping code myself.

Contact heading and line: "Let's talk." and "Feel free to get in touch directly." (the second is from the LinkedIn summary).

### Selected work

Experience and Selected work cover overlapping ground, so give them different jobs. **Experience describes the role**: what he did and was responsible for. **Selected work describes the product**: what it is and what it runs on. Each card shows a large index number, the product name, one sentence, the role, the years and technology tags.

| # | Product | Company, years | Role | One sentence | Tags |
|---|---|---|---|---|---|
| 1 | Assign · Score · Surveillance | CareDx, 2021–26 | Architect · team lead | Client applications of three transplant-diagnostics products in one shared Angular workspace, with ThreeJS visualisations and Electron desktop builds on Java Spring services. | Angular workspace, TypeScript, ThreeJS, Electron, Java Spring, SQLite, Cypress, Jest, Azure DevOps |
| 2 | Delivery & Provider manager platforms | ROKSH, 2020–21 | Architect · lead developer | Platforms for a grocery delivery service, ALDI Hungary's partner: .NET Core services on Azure, Angular PWAs and payment integrations. | .NET Core 3.1, Azure, Angular 11, PWA, Revolut, Barion |
| 3 | 10XOne ERP | Freelance, 2019–20 | Senior full stack .NET developer | Maintaining existing functionality, and researching and implementing new features, in the 10XOne ERP. | .NET Core 3.1, ASP.NET, WPF, SignalR, MSSQL, React |
| 4 | StoriesOnBoard | DevMads, 2017–19 | Full stack developer | Single-page application development for an industry-leading story mapping tool. | TypeScript, KnockoutJS, C# / .NET, Azure, MSSQL |
| 5 | Iceberg & Outlast Framework | Outlast, 2015–16 | Senior full stack developer · remote | An agency's own PHP and JavaScript framework and an ASP.NET platform, with many API integrations: Google Maps, SendGrid, Postmark, Xero, ACHWorks. | PHP, JavaScript, ASP.NET, T-SQL, Node.js, Google Maps, SendGrid, Xero |
| 6 | GPS fleet tracking | AsystANT, 2013–15 | Senior web developer | A GPS-based vehicle fleet tracking application for web and desktop, with Oracle, ExtJS and Symfony under the hood. | Symfony, ExtJS, Oracle PL/SQL, REST |
| 7 | University of Omniscience portal | Mindentudás Egyeteme, 2010–11 | Joomla CMS developer | Web portal of the well-known Hungarian science TV programme, built on Joomla. | PHP5, Joomla (K2), MySQL |
| 8 | Website-builder application | Megaweb, 2008–09 | PHP developer | A custom, commercial online website maker on the company's own PHP framework ("mayaFish"). | PHP5, MySQL, Dojo, ExtJS |

In Hungarian, card 7 is "Mindentudás Egyeteme portál"; that is the programme's real name.

## 8. Visual direction

Carry over the identity of the existing PDF CV so the two read as one set. All of it is defined in the `<style>` block of `cv-onepage.html`.

Colours:

| Role | Value |
|---|---|
| Ink (dark background) | `#0F262D`, raised surface `#15323B` |
| Text on ink | `#EEF3F1`, soft `#C4D3D5`, muted `#8FA9AF` |
| Amber (accent) | `#F2B33D`; on light backgrounds use `#8A5709` for text and `#C8841A` for fills |
| Paper (light background) | `#FBFCFB`, text `#12262C` |
| Bars of earlier stacks | `#5B7D85` |

Typography, three voices as in the CV:

- **Structure:** Archivo. Headlines use the variable font at its widest setting (`font-stretch: 125%`) and weight 800; import `@fontsource-variable/archivo/wdth.css` to get the width axis.
- **Prose:** Source Serif 4.
- **Data** (dates, tags, code-like fragments): JetBrains Mono.

The `fonts/` folder in the project root holds subsets built for the PDF. Do not use them for the site; the Fontsource packages cover Hungarian.

**Signature motif:** the "six stacks in 23 years" timeline. The 3D tower in the hero shows the same data in space that the chart in section 4 shows precisely.

## 9. 3D elements (three.js)

One fixed, full-window `<canvas>` behind the content, with a single renderer and scene.

1. **Stack tower (hero).** Six slabs stacked vertically, newest on top. The horizontal axis is time (2003–2026), so each slab's length and offset are that stack's real span, which turns the CV chart into a staircase in space. The `--from` and `--to` values are on the `.track` elements in `cv-onepage.html`. The three current stacks (TypeScript, Angular, Java Spring) are amber; the three earlier ones (.NET · C#, PHP · Symfony, Flash · ActionScript) are grey-teal with blueprint-style edge lines. The tower turns slowly and follows the pointer; as the hero scrolls away, the slabs separate and rotate. Labels are HTML elements positioned by projecting 3D points to the screen, so the text stays crisp and readable by assistive technology.
2. **Depth particle field and grid plane (whole page).** The camera travels through it on scroll; this gives the background its parallax.
3. **Shuriken (contact).** A slowly spinning four-point throwing star with amber edges, a nod to "Ninja" in the LinkedIn headline. It speeds up on pointer movement. Keep it elegant, not cartoonish.

**DOM anchors.** Each 3D object follows an empty HTML element (for example `data-anchor="tower"`). Every frame the scene converts that element's screen rectangle into a world position. The 3D layout then follows the responsive HTML layout and scrolls with the page without separate breakpoints in the scene code.

Performance and fallbacks:

- Cap the device pixel ratio at 2. Render only while a dark section is on screen and the tab is visible.
- Load three.js as a separate, deferred chunk. The text must appear without waiting for it.
- Without WebGL the canvas stays hidden and the content is complete.
- With `prefers-reduced-motion` the scene holds still and redraws only on scroll and resize.

## 10. Animation and parallax

Write a small script of your own with `IntersectionObserver` and a single `requestAnimationFrame` loop. An animation library is not needed.

| Effect | Where | Approach |
|---|---|---|
| Name reveals letter by letter | hero | masked lines, staggered delay |
| Reveal on scroll | every section | `data-reveal`, stagger through a `--i` custom property |
| Parallax layers | huge outlined section numerals, portrait, quotation mark, card columns | `data-speed`; offset proportional to the distance from the viewport centre |
| Fixed 3D background | dark sections | light sections slide over it |
| Counting numbers | Stats | when they enter the viewport |
| Growing bars | Six stacks | `scaleX` from 0 to 1, staggered |
| Filling timeline | Experience | scroll progress drives the line height and activates the dots |
| Card tilt and glare | Selected work | CSS `perspective`, pointer tracking |
| Technology marquee | Skills | CSS animation |
| Progress bar, active nav item | nav | scroll progress, section observer |

With `prefers-reduced-motion`, turn off parallax, tilt and the marquee, and show content immediately. Without JavaScript all text must still be readable: apply the hidden starting state of reveals only once the script has started (for example through a class on `<html>`).

## 11. Responsive behaviour and accessibility

- **Breakpoints:** phone (< 640 px), tablet (640–1024 px), desktop (> 1024 px). Fluid type with `clamp()`.
- **Phone:** one column. The stack tower moves below the hero text at a smaller size. The nav shrinks to the monogram and the language switch. No horizontal scrolling at any width.
- **Accessibility:** semantic heading order, a skip link, visible focus, WCAG AA contrast, `aria-hidden` on the canvas, `alt` text on the portrait, and every function reachable by keyboard.
- **Images:** run the portrait through Astro's image pipeline (`sharp` is installed) for modern formats and several sizes.

## 12. Backend (Danet)

Facts read from the Danet 2.12.0 source:

- `app.useStaticAssets(dir)` serves files. It maps both `/en` and `/en/` to `en/index.html`. **It needs an absolute path**: it prepends `/` to the resolved path on non-Windows systems.
- It sets no cache headers. When a file is missing it logs a warning and passes the request on, which ends in a bare 404. Hence the custom header layer and 404 handler below.
- A controller method may return a ready `Response`, which Danet sends as is. That is the simple way to redirect.
- `app.use(mw)` registers a Hono middleware for all routes; `app.router` exposes the underlying Hono instance.
- Decorators need `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` under `compilerOptions` in `deno.json`.

Parts:

| Part | Job |
|---|---|
| `LocaleController` + `LocaleService` | `GET /` → 302 to the right language (cookie → `Accept-Language` → English). Keep the negotiation logic in the injectable service and unit test it. |
| `HealthController` | `GET /api/health` → `{ status, uptime }` |
| Header middleware (`app.use`) | `/_astro/*`: one year, `immutable`; HTML: `no-cache`; security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, a CSP that fits the built site) |
| Compression | Hono's `compress` middleware; it matters because of the three.js bundle |
| Static files | `app.useStaticAssets(SITE_DIST)`, called after `init` so controllers take precedence |
| 404 | `app.router.notFound` → `dist/404.html` with status 404 |

Configuration through environment variables: `PORT` (default 3000) and `SITE_DIST` (default `../site/dist`, resolved to an absolute path from `import.meta.dirname`). Deno permissions: `--allow-net --allow-read --allow-env`.

Not yet tested:

- Importing `compress` from `jsr:@hono/hono@4.6.3/compress`. Use the same Hono version Danet pins, to keep the middleware types compatible.
- A request path that matches a directory without an `index.html` (for example `/_astro`). Make sure it ends in a clean 404 and not an error.

## 13. Running

```bash
# development with hot reload
cd site && npm run dev

# production: build, then serve with Danet
cd site && npm run build
cd ../backend && deno task start        # http://localhost:3000

# both in one step
cd backend && deno task serve
```

Planned `deno task`s: `dev` (watch mode), `start`, `build:site`, `serve`, `test`.

## 14. Order of work and verification

Suggested order, so that there is a complete page at every stage:

1. Scaffold: Astro config, i18n routes, `Base.astro`, tokens, fonts.
2. Content: `types.ts`, `shared.ts`, `en.ts`, then `hu.ts`.
3. Sections as static HTML and CSS, phone first. The page is complete without animation.
4. Motion: reveals, parallax, counters, timeline, card tilt.
5. 3D: scene, anchors, tower, particle field, shuriken, fallbacks.
6. Backend: Danet module, locale negotiation, headers, static files, 404.
7. Verification and polish.

Verification:

- `astro check` and `astro build` without errors; `deno check` and `deno test` in the backend.
- With `curl` against the running Danet server: `/` redirects according to the cookie and `Accept-Language`; `/en/` and `/hu/` return 200; an unknown path returns 404 with the custom page; the cache and security headers are present.
- Screenshots at 390, 768 and 1440 px width, in both languages, at several scroll positions. Google Chrome is installed at `/Applications/Google Chrome.app` and runs headless; WebGL in headless mode may need a software-rendering flag such as `--enable-unsafe-swiftshader`. Look at the screenshots: check for overlapping text, overflow and unreadable contrast over the 3D scene.
- Reduced motion, no WebGL and no JavaScript each still give a complete, readable page.

## 15. Open questions and defaults

The owner has not answered these. Proceed with the default and list them in your final report so the owner can change them.

| Question | Default |
|---|---|
| Domain | Unknown. Leave `site` unset in `astro.config.mjs` and omit the canonical URL and absolute Open Graph image URL. |
| Phone number and email on a public site | Show both; they are on the CV. Keep them in `shared.ts` so the phone number is easy to remove. |
| "Ninja" tagline and the shuriken | Include both. The one-page CV dropped the tagline, so keep the shuriken easy to swap for a neutral shape. |
| Downloadable CV | Offer `Tibor_Nemeth_CV_OnePage.pdf` on both languages and label it as English on the Hungarian page. No Hungarian PDF exists. |
| Third language | No. English and Hungarian only. |
| Contact form | No. Direct contact details instead. |
| Hosting | Undecided. Do not add a `Dockerfile` or deployment config. |

## 16. Design revision (2026-11-12)

The owner found the first build generic: the star-like particle background was boring and the 3D slab tower did not look good. The revision keeps the content, palette, fonts, routing and backend, and changes the visuals. The motif is now the line: ridgelines, branch lines, timeline rails.

| Was (sections 7–10) | Now | Where |
|---|---|---|
| Depth particle field and grid plane | **Ridgeline terrain**: a noise heightfield drawn only with one line per row, over an ink-coloured surface that hides the ridges behind nearer ones. It has its own camera; scrolling flies it forward, raises it and tilts it down, and it returns to the low horizon view at the contact section. A cool glow sits behind the mountains. | `src/scripts/scene/terrain.ts` |
| Stack tower of six slabs | **Stack graph**: the career drawn as a git graph. A trunk runs 2003 → today, each stack forks off at its first year and merges back at its last, the three current stacks stay open and run to today in amber with a light at the head. Dots on the trunk are role starts (`roleStarts` in `src/i18n/shared.ts`). It draws itself in from 2003 on load. Labels are still HTML, styled as git refs: open branches right of the head, merged branches under the line. | `src/scripts/scene/graph.ts`, `Hero.astro` |
| Flat extruded shuriken | A hira shuriken built like the real thing: a flat steel plate with wide blades, a hole in the middle and a ground bevel all round (flat-shaded, so flat and bevels catch the light differently), with afterimages when it spins up. An earlier version (a spine on every point, two gimbal rings, tilted far over) read as a compass rose, not a throwing star: keep it flat, holed, ring-free and nearly face-on. | `src/scripts/scene/shuriken.ts` |
| One scene, one camera | Two layers on one renderer: terrain with its camera, then the anchored objects with the straight camera (`autoClear` off, depth cleared in between). Since the second revision both go through `post.ts`. | `src/scripts/scene/index.ts` |
| Straight edges between dark and light sections | **Ridge-shaped edges**: light sections rise out of the terrain as a paper mountain ridge and break off into dark peaks, with thin ridgelines on their own parallax speed. Profiles are generated at build time from a seed. | `src/components/Ridge.astro`, `base.css` |
| Huge outlined section numerals 01–05, large outlined card numbers | Removed: the sections are not a sequence. Kickers carry the `//` mark of the hero tagline; work cards lead with their years. | components, `base.css` |
| Pill buttons, 20 px rounded glass cards | Square, engineered surfaces: 3–4 px radii, hairlines, amber corner marks on the chart and the work cards. | `sections.css` |

### Film look (second revision, same day)

The owner asked for a more cinematic animation, with depth of field. Added:

| What | How | Where |
|---|---|---|
| Depth of field | The terrain is rendered to a half-float target with a depth texture. A gather blur on a golden-angle spiral runs at half resolution and is mixed over the sharp image by blur radius (reciprocal-distance model: near ground blurs fast, the far distance levels off). The anchored objects are drawn afterwards and stay sharp. | `src/scripts/scene/post.ts` |
| Rack focus | The focus distance starts on the near ground and pulls out to the mountains during the opening shot, moves nearer when the camera looks down mid-page, and follows the pointer's height a little. It is eased, never set directly. | `index.ts` (`focusNow`) |
| Bloom and anamorphic streak | Soft-threshold bright pass, a four-level dual-filter pyramid, plus three horizontal blur steps for a wide streak on the hottest lights (the open branch heads). | `post.ts` |
| Lens and film | Slight colour fringing towards the corners, vignette, highlight roll-off that leaves values below the knee untouched, grain added after the sRGB conversion. | `post.ts` (final pass) |
| Dust motes | Sixteen points (eight on phones) between camera and mountains that draw their own bokeh from the same focus uniforms: big faint discs out of focus, small specks in focus. Hidden behind the land with the terrain depth. | `src/scripts/scene/motes.ts` |
| Camera | Opening push-in that eases to rest, a faint hand-held sway, and inertia on the scroll position that drives the terrain camera (the anchored objects still follow the DOM exactly). | `terrain.ts`, `index.ts` |
| Quality steps | 2 = film look at pixel ratio ≤ 1.5; 1 = film look at ratio 1 with fewer samples; 0 = no post-processing. The scene steps down by itself when frames average over 38 ms, never up. `?fx=0|1|2` pins a step (used for the screenshots, because software rendering would step down at once). Without float render targets, or with reduced motion, see below. | `index.ts` |

With `prefers-reduced-motion` the film look stays on but nothing moves: one still frame, focus already at rest, static grain.

Things to know when changing it further:

- The clear colour is set again after every `setRenderTarget`: three converts it to the colour space of the target that is bound at that moment.
- Post-processing was only checked in headless Chrome with software rendering. Safari, iOS and low-end Android GPUs are untested; `post.check()` falls back to the plain picture if the float targets are refused.

- ShaderMaterials end with `#include <colorspace_fragment>`; colours passed as uniforms are linear, so without it they come out too dark.
- The terrain lines and its hiding surface share one vertex buffer and one vertex shader, so they sit on identical heights; the surface is pushed back with `polygonOffset`. Keep them in sync.
- On narrow anchors the graph is stretched vertically (`stretch` in `index.ts`) so the labels keep apart; dots are counter-scaled to stay round.
- Verified with headless Chrome (`--enable-unsafe-swiftshader`) at 390, 820 and 1440 px in both languages, with reduced motion and with JavaScript off; `astro check` and `astro build` pass.

### Cosmic background (third revision, 2026-11-15, branch `cosmic-bg`)

The owner did not like the landscape background and asked for a cosmic one instead: 3D, three.js, with movement, geometric shapes welcome, and quiet enough that the foreground stays in front. The first build's "star-like particle background" had been rejected as boring (see the top of this section), so a flat field of dots is not an answer. This one has depth, one landmark and a few bodies that turn.

The change lives on its own branch; `shade-b` still has the terrain. Only the first layer of the scene changed: `terrain.ts` is gone and `src/scripts/scene/cosmos/` took its place. The stack graph, the shuriken, `post.ts` (one callback renamed to `backdrop`), the HTML and the CSS are as they were. The notes above about the terrain (shared vertex buffer, depth of field, dust motes) describe `shade-b`, not this branch.

| Part | What it is | Where |
|---|---|---|
| Sky | One triangle over the whole view. Thin gas from domain-warped simplex noise, gathered in a diagonal band like the plane of a galaxy, with darker lanes; plus the faintest stars as dust from a hash grid, sized in CSS pixels. It moves at about 3% of the page speed. | `cosmos/sky.ts` |
| Stars | Up to 1,800 points at depths 14–170; the number drawn follows the aspect ratio, so a phone is as densely starred as a wide screen. Each star lives in a wrap box that grows with its depth, so the field is endless. Small ones twinkle; about 2% are bright, with a halo and four spikes; about 30% sit in loose clusters, because evenly scattered stars look like noise. | `cosmos/stars.ts` |
| Planet | The one landmark: a dark sphere with a lit crescent, a graticule that turns with it, ten ring lines (one amber) and two moons on drawn orbits. It is at depth 150, so it rises only about half a screen while the whole page scrolls by. The body is opaque and drawn after the stars, so it covers them. | `cosmos/planet.ts` |
| Satellite | The second body, on the left: a glass box with drawn edges, two solar panels on booms (amber cell lines), a dish that leans to one side and a mast with an amber beacon that flashes every 3.4 s. It turns around its own axis once in 140 s, seen from above at an angle, so it reads as a satellite in every phase; a panel glints when it mirrors the light. | `cosmos/satellite.ts`, `cosmos/kit.ts` |
| Shooting star | One thin streak every 7–16 seconds, under a second long, in the upper part of the view. | `cosmos/meteor.ts` |
| Assembly | Where everything is, how it moves, draw order. | `cosmos/index.ts` |

How it moves:

- The camera never leaves the origin. Where it "is" in the field is one 2D vector, the travel; every part reads it and moves the other way. A body at depth `d` moves at `REF / d` of the page speed (`REF = 9`): the nearest stars at 64%, the satellite at 14%, the planet at 6%. The satellite leaves at the top and comes in again from below (`LAP`).
- Without scrolling the camera still floats in a slow, bounded figure (about 3 units either way), the satellite turns, the planet turns, the moons orbit, the stars twinkle and the gas streams. Nothing drifts away from where it was put.
- Opening shot: the camera comes down 9 units and eases to rest in 3.6 s, so the sky rises into place while the name comes in.
- With `prefers-reduced-motion` the clock stands still: one still frame, redrawn on scroll and resize, and no shooting stars.

Rules that keep it a background. Keep them when changing it:

- The empty sky is exactly the page ink (`#0F262D`), so the ink-coloured patches behind the hero copy and the nav melt into it. The brightest gas is `#17404A`: any lighter and the muted text (`#8FA9AF`) on it drops under 4.5:1.
- The text of the page is set to the left. The planet has the lower right corner. The satellite has the left side and two places there (`SATELLITE` in `cosmos/index.ts`): where the page column leaves a left margin 1.5 times as wide as the satellite, it floats in the middle of that margin; otherwise it sits beside the buttons under the hero copy, the one spot of the left half that stays free on a laptop. The margin is measured from the first `.wrap` element in `scene/index.ts` and handed to `cosmos.resize()`. On an upright screen there is no free side: the satellite is fainter and sits in the gap between the buttons and the graph, and the planet starts below the fold. Further down the page it passes behind text and cards; that is accepted, it is dim.
- Stars, lines and glass only add light. In the float pipeline that is linear; straight to the canvas (quality step 0) it would be added to sRGB values and come out far too strong, so every additive shader goes through `emit()` (`cosmos/shared.ts`), which bends it back.
- three sorts by the draw order of the nearest group first, and every nested group starts that again. `drawOrder()` in `cosmos/shared.ts` gives all the groups of a layer the same number; without it the planet's body does not cover the stars.

Changed on the same day, on the owner's request: the five glass polyhedra (`cosmos/solids.ts`: icosahedron, dodecahedron, star, tesseract, octahedron) are gone; the planet stayed and a satellite on the left took their place. Checked in headless Chrome on the real GPU at 390 × 844, 820 × 1180, 1280 × 720, 1440 × 780, 1440 × 900, 1536 × 730, 1920 × 1080 and 2560 × 1300, with `?fx=0` and with reduced motion.

Left as it was, for the owner to decide: the ridge-shaped section edges (`Ridge.astro`) are still mountain ridges. They read as peaks under a night sky, but they come from the landscape idea.

Verified in headless Chrome on the real GPU (Apple M1 Pro; `--headless=new --enable-gpu --use-angle=metal`, so no software-rendering flag and no pinned `?fx`) at 390 × 844, 820 × 1180, 1440 × 900, 2560 × 1300 at 2x and 3440 × 1440, in both languages, with `?fx=0`, and with reduced motion; `astro check` and `astro build` pass. At 2560 × 1300 at 2x it ran at 48 fps on quality step 2, against 40 fps for the terrain, and at 60 fps on steps 1 and 0. Safari, iOS, Android and weak GPUs are untested, as before.

Note for the next run: with Astro 7, `astro dev` starts the server in the background and returns at once; `astro dev stop` ends it.

### Professional redesign (fourth revision, 2026-11-16, branch `pro-design`)

The owner asked for a much more professional design: the three.js backgrounds are good in their themes but had to be executed far better without slowing the page down, and the typography had to become much more professional and more stylish. The content, the section order, the i18n mechanism, the backend and the themes of the scene are as they were. Where sections 8 to 10 or the earlier parts of this section disagree with this part, this part and the code win.

The page:

| Was | Now | Where |
|---|---|---|
| Archivo at its widest and heaviest for the name and every heading, Source Serif 4 for prose, JetBrains Mono capitals for labels | Three voices: **Newsreader** (display serif with an optical-size axis, light weights; the name is set roman, then italic, in one colour), **Geist** for text and UI, **Geist Mono** for data. Tokens hold the families, a fluid type scale (a perfect fourth), line heights, tracking that tightens with size, and weights. Fallback fonts carry metric overrides so the swap barely moves the text; the three files of the first screen are preloaded. | `styles/tokens.css`, `layouts/Base.astro` |
| Ridge-shaped (torn) edges between dark and light sections | Straight edges. `Ridge.astro` is gone. Light sections are warm paper (`#F4F1EA`). | `styles/base.css` |
| `//` kickers, amber corner brackets, a pulsing status pill, an outlined-text marquee, cards that tilt with a glare, a portrait that swings in, a scroll cue | Removed. A 12-column rail grid: labels, dates and the portrait in the first four columns, the content in the other eight; hairlines instead of boxes. Selected work is a list, not cards. The portrait is shown in greyscale (a CSS filter in `sections.css`, one line to undo). | `styles/sections.css`, `components/` |
| Amber on the name, headings, numbers, borders and labels at once | Amber only on the primary action, on "current" data and on the reading progress. | `styles/` |
| Content fading in and out in both directions; parallax, tilt and the timeline fill computed on every scroll frame (about 9 forced style recalculations per frame) | Content is revealed once (one `IntersectionObserver`) and stays; nothing runs on scroll. | `scripts/motion.ts` |
| A dark nav slab over every section | The nav takes the colour of the section under it (`nav.ts` sets `.on-light`), with a small blurred veil; nothing at all while the hero is at rest. | `scripts/nav.ts`, `styles/sections.css` |
| Headline numbers as a boxed section of their own | A band of numbers that closes the first screen. | `styles/sections.css` |

The scene:

| Was | Now | Where |
|---|---|---|
| Planet as a dark disc with a graticule and hairline rings | A shaded, backlit gas giant: banded globe, soft terminator, an atmosphere that glows along the limb, a real ring disc with a density profile (bands, one division) that scatters the light forward, the planet's shadow on the rings and theirs on the planet, two small moons. | `cosmos/planet.ts` |
| Satellite as a line drawing with dots | A small solid model, lit: foil body, wings with a cell grid, dish, mast with a beacon. One mesh and one point. `cosmos/kit.ts` (line, dot and glass materials) is gone. | `cosmos/satellite.ts` |
| The same four-point sparkle on 2 % of the stars | Bright stars have a soft halo; only five carry thin spikes, each turned a little differently. | `cosmos/stars.ts` |
| Nebula computed per pixel at full resolution (about 17 noise evaluations per pixel per frame) | The gas (now with filaments and dust lanes) is computed in a buffer 288 px tall and enlarged; only the star dust is added per pixel. | `cosmos/sky.ts` (`prerender`) |
| Stack graph: fat tubes with additive glow shells, 40 sphere meshes, sprites (about 65 draw calls); it swayed by itself and "exploded" on scroll | One mesh of thin lines with a constant width in pixels, commit dots and head lights as points (5 draw calls). It stands still unless the pointer or the page moves, so the HTML labels are only rewritten then; scrolling away it recedes and fades. | `scene/graph.ts` |
| Throwing star: lit standard material, yellow outline lines, ghost outlines, four lights in the overlay scene | Dark brushed steel in a shader of its own that mirrors an analytic dusk (dark sky, glowing horizon, the sun, pale sky light behind the viewer). Smaller. The overlay scene has no lights any more. | `scene/shuriken.ts` |
| Landscape: khaki dunes under a teal sky with contour lines; per pixel three noise heightfield evaluations for the normal and up to 22 for the shadow; it replaced the cosmos below the top of the contact section (scissor) | Mountain ridges at dusk, backlit, each further ridge nearer to the colour of the haze. Height, normal and a soft shadow are **baked once** into a 1024 × 512 texture (`prepare`); per frame the mesh is displaced and lit from it. It is drawn **over** the cosmos; its sky is only a glow at the horizon, so the stars and the planet stay visible above the mountains. The camera's travel is counted back from the end of the page, so every page length sees the same land. | `scene/terrain.ts` |
| Post: bloom from half resolution, three passes of anamorphic streak, colour fringing, grain 0.024; an antialiased canvas *and* a 4-sample float target | Bloom from a quarter of the resolution, no streak, no fringing, grain 0.011. In the film path the canvas itself is not antialiased; the float target has 2 samples per pixel on a dense buffer (pixel ratio ≥ 1.4) and 4 otherwise. | `scene/post.ts` |
| Quality tiers by pixel-ratio cap; a tier went only when frames averaged over 38 ms | Tiers by **pixel budget** (3.4, 1.9 and 1.5 megapixels), so a large screen costs what a laptop screen costs. A tier goes when more than 60 % of 40 frames took over 24 ms. The lowest tier keeps the composition target and skips the bloom; `?fx=0` still draws straight to the canvas (the path of a GPU without float targets). | `scene/index.ts` |
| `getBoundingClientRect` and `offsetWidth` on anchors and labels every frame | Rectangles and label sizes are measured when the layout can have changed (resize, fonts, document height) and positions follow from `scrollY`; a label's style is written only when its value changes. | `scene/index.ts`, `scene/anchors.ts` |
| The cosmos lit from the upper left, the landscape from the right | One sun for everything: low, to the right, behind the scene. Every body is backlit. | `scene/sun.ts` |
| Planet and satellite placed in fixed view coordinates | Placed from the page layout (`Layout` in `cosmos/index.ts`, measured in `scene/index.ts`): the planet rests on the band of numbers of the first screen and climbs to the upper right with the reading progress; the satellite starts in the gap beside the hero buttons, or in the left margin on a wide screen. | `cosmos/index.ts` |

Measured with headless Chrome on the real GPU (Apple M1 Pro), quality tier pinned with `?fx=2`: milliseconds per animation frame, CPU and GPU together (a 1-pixel `readPixels` after every frame forces the GPU to finish). A page that draws one triangle costs about 2.5 ms measured this way.

| Viewport | Before: hero / stacks / work / page end | After |
|---|---|---|
| 1440 × 900 at 2x | 13.1 / 10.9 / 11.3 / 13.8 | 8.6 / 6.8 / 6.3 / 9.2 |
| 2560 × 1300 at 2x | 24.2 / 21.2 / 21.0 / 41.0 | 11.1 / 10.9 / 10.5 / 12.7 |
| 390 × 844 at 3x (phone size) | 6.8 / 6.8 / 7.6 / 8.8 | 4.0 / 3.6 / 4.4 / 5.3 |

Style recalculations per frame while scrolling: 8.7 before, 1.2 after.

Things to know when changing it further:

- Multisampling the float target is the most expensive single thing in a frame: at 1440 × 900 at 2x the hero costs 11.4 ms with 4 samples, 8.5 with 2 and 6.0 with none.
- The planet is the one body that is not lit by the scene's sun: see the fifth revision below.
- An opaque body of the cosmos (globe, moons, satellite) is flagged `transparent`, so it is drawn after the stars and covers them. A see-through object is always drawn after the opaque ones, whatever its `renderOrder`: the glow of the landscape's sky relies on the depth test to stay behind the land.
- The landscape is baked for the height the mountains have at the current aspect ratio and is baked again when that changes. The baked stretch covers a travel of 46 world units before the end of the page (`TRAVEL` in `terrain.ts`) and screens up to 21:9.
- Anchor elements (`data-anchor`) must not be moved by CSS transforms: the scene works from layout positions. The hero figure is revealed with `data-reveal="fade"`, opacity only.
- A backtick inside a GLSL comment ends the template string it is written in.
- Verified at 390 × 844, 1280 × 720, 1440 × 900 (1x and 2x), 1920 × 1080 and 2560 × 1300, in both languages, with `?fx=0` and `?fx=1`, with reduced motion and with JavaScript off, and behind the Danet backend with its Content-Security-Policy; `astro check`, `astro build` and the backend tests pass. Safari, iOS, Android and weak GPUs are untested, as before.

Left for the owner to decide:

- The printed CV still uses Archivo and Source Serif 4, so the site and the PDF no longer share their typefaces.
- Two other typographic directions were tried and are kept, unfinished, on the branches `wip/design-swiss` (Geist only) and `wip/design-heritage` (Archivo, Source Serif 4 and JetBrains Mono, set far more quietly).
- The portrait is shown in greyscale.
- The first screen loads about 235 kB of fonts (Newsreader with its optical-size axis is 132 kB, Unbounded 51 kB); the Hungarian page loads the Latin Extended files on top.

### Fifth revision (2026-11-17, same branch)

The owner's feedback on the fourth revision: the backgrounds are better; the mix of upright
and italic type is not nice, and the name should look more like a film title, in another
typeface; the visual elements that moved with the scroll are missed, among them the line of
the Experience section; the planet covered its own ring. The mountain-ridge (torn) section
edges were shown to the owner again and declined: the edges stay straight.

| Was | Now | Where |
|---|---|---|
| The name set upright, then italic; an italic monogram, footer name, contact heading and quote | No italics anywhere. The italic Newsreader files are no longer loaded. | `components/Nav.astro`, `Footer.astro`, `styles/sections.css`, `layouts/Base.astro` |
| The name in the display serif | The name is a title card: wide, thin capitals of **Unbounded** (a fourth typeface, used for the name, the role under it, the monogram and the footer name only), lit softly from above, coming in letter by letter out of a blur. The role stands under it in small spaced capitals. | `components/Hero.astro`, `styles/tokens.css`, `styles/sections.css`, `styles/base.css`, `layouts/Base.astro` |
| Planet backlit: a dark globe whose shadow hid the near arc of its rings | The planet has a light of its own, from the front right: a banded, mostly lit globe; the near arc of the rings passes in front of it, the far arc behind it. The ring plane is tipped with the planet's height in the view, so the rings stay open by the same amount. | `scene/cosmos/planet.ts` |
| No scroll-linked motion in the page (the fourth revision had removed it together with its layout reads) | `motion.ts` moves elements with `data-speed` and fills lines with `data-track`. It measures when the layout changes and only does arithmetic while scrolling: a scroll frame reads nothing from the page. | `scripts/motion.ts`, `styles/base.css` |
| A still portrait, a plain quote | The photograph drifts inside its frame; a large pale quotation mark (the raised mark of the page's language) drifts above the quote. | `components/About.astro`, `styles/sections.css` |
| Selected work as one row per product | From 1024 px two columns, the right one lower and drifting. | `components/Work.astro`, `styles/sections.css` |
| The roles of the Experience section as a plain list with one amber mark | A line in the left margin fills as the page scrolls through the list, and the mark of each role lights up when the fill reaches it. | `components/Experience.astro`, `styles/sections.css`, `scripts/motion.ts` |

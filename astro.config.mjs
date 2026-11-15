// @ts-check
import { defineConfig } from 'astro/config';

// Static output only. Language routing is done by the [lang] route (src/pages/[lang]/index.astro)
// and, in production, by the Danet backend at "/". Astro's own i18n routing is not used, so it
// cannot fight the hand-written fallback page at src/pages/index.astro.
// `site` is left unset until the domain is known (see plan.md, section 15).
export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // three.js is one ~560 kB chunk (143 kB gzipped), loaded on idle after the text.
  vite: { build: { chunkSizeWarningLimit: 700 } },
});

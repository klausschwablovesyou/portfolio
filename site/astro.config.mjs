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
  vite: {
    build: {
      // three.js is one ~605 kB chunk (152 kB gzipped), loaded on idle after the text.
      chunkSizeWarningLimit: 700,
      // A font file is never inlined into the CSS as a data: URL, however small it is: the
      // backend's content security policy takes fonts from the site itself only
      // (font-src 'self'). The Cyrillic Extended file of Unbounded is under Vite's 4 kB limit.
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    },
  },
});

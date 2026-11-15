import { isAbsolute, join, normalize } from '@std/path';

/** Languages the site is built in. Keep in sync with site/src/i18n/index.ts. */
export const SUPPORTED_LOCALES = ['en', 'hu'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const PORT = Number(Deno.env.get('PORT') ?? 3000);

/** Absolute path of the built Astro site. Danet's static server needs an absolute path. */
export const SITE_DIST = resolveDist(Deno.env.get('SITE_DIST') ?? '../site/dist');

function resolveDist(dir: string): string {
  const base = join(import.meta.dirname ?? '.', '..');
  return normalize(isAbsolute(dir) ? dir : join(base, dir));
}

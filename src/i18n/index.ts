import type { Locale, SiteContent } from './types';
import en from './en';
import hu from './hu';

export type { Locale, SiteContent } from './types';

/**
 * Supported languages. Adding one: write a content file that satisfies SiteContent,
 * add it here, and add the code to SUPPORTED_LOCALES in backend/src/config.ts.
 */
const content: Record<Locale, SiteContent> = { en, hu };

export const locales = Object.keys(content) as Locale[];
export const defaultLocale: Locale = 'en';

export function getContent(locale: Locale): SiteContent {
  return content[locale];
}

export function isLocale(value: string | undefined): value is Locale {
  return !!value && value in content;
}

/** Path of a language's page, e.g. "/hu/". */
export function localePath(locale: Locale, hash = ''): string {
  return `/${locale}/${hash}`;
}

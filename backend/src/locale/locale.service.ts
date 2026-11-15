import { Injectable } from '@danet/core';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '../config.ts';

export const LOCALE_COOKIE = 'lang';

/**
 * Picks the language for "/": the `lang` cookie first (set by the site's language switch),
 * then the Accept-Language header, then English.
 */
@Injectable()
export class LocaleService {
  private readonly supported: readonly string[] = SUPPORTED_LOCALES;
  private readonly fallback: string = DEFAULT_LOCALE;

  negotiate(cookieHeader: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
    return (this.fromCookie(cookieHeader) ?? this.fromAcceptLanguage(acceptLanguage) ?? this.fallback) as Locale;
  }

  fromCookie(cookieHeader: string | null | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      if (part.slice(0, eq).trim() !== LOCALE_COOKIE) continue;
      const value = part.slice(eq + 1).trim().toLowerCase();
      return this.supported.includes(value) ? value : null;
    }
    return null;
  }

  /** Highest-q supported language; "hu-HU" matches "hu". Ties keep header order. */
  fromAcceptLanguage(header: string | null | undefined): string | null {
    if (!header) return null;
    const ranked = header
      .split(',')
      .map((entry, index) => {
        const [tag, ...params] = entry.trim().split(';');
        let q = 1;
        for (const p of params) {
          const [k, v] = p.trim().split('=');
          if (k === 'q') q = Number(v);
        }
        return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
      })
      .filter((e) => e.tag && e.q > 0)
      .sort((a, b) => b.q - a.q || a.index - b.index);

    for (const { tag } of ranked) {
      const primary = tag.split('-')[0];
      if (this.supported.includes(primary)) return primary;
    }
    return null;
  }
}

import type { MiddlewareHandler } from '@hono/hono';
import { walk } from './walk.ts';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const HTML = 'no-cache';
const OTHER = 'public, max-age=86400';

/**
 * SHA-256 hashes of every inline <script> in the built HTML, so the CSP can allow exactly
 * those scripts instead of 'unsafe-inline'. Computed once at startup.
 */
export async function inlineScriptHashes(distDir: string): Promise<string[]> {
  const hashes = new Set<string>();
  const inline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for await (const file of walk(distDir, '.html')) {
    const html = await Deno.readTextFile(file);
    for (const match of html.matchAll(inline)) {
      const body = match[1];
      if (!body.trim()) continue;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      hashes.add(`'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
    }
  }
  return [...hashes].sort();
}

export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    // Astro components use inline style attributes for CSS custom properties.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Cache and security headers for every response. */
export function headers(csp: string): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const res = c.res;
    const path = c.req.path;
    const type = res.headers.get('content-type') ?? '';

    if (!res.headers.has('cache-control')) {
      if (res.status >= 400) res.headers.set('cache-control', 'no-store');
      else if (path.startsWith('/_astro/')) res.headers.set('cache-control', IMMUTABLE);
      else if (type.includes('text/html')) res.headers.set('cache-control', HTML);
      else res.headers.set('cache-control', OTHER);
    }

    res.headers.set('x-content-type-options', 'nosniff');
    res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    res.headers.set('x-frame-options', 'DENY');
    res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (type.includes('text/html')) res.headers.set('content-security-policy', csp);
    if (res.headers.has('content-encoding')) res.headers.append('vary', 'Accept-Encoding');
  };
}

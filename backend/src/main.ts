import { DanetApplication } from '@danet/core';
import { join } from '@std/path';
import { AppModule } from './app.module.ts';
import { PORT, SITE_DIST } from './config.ts';
import { compress } from '@hono/hono/compress';
import { contentSecurityPolicy, headers, inlineScriptHashes } from './http/headers.ts';

/**
 * Serves the built Astro site (site/dist):
 *   GET /            → 302 to /en/ or /hu/ (LocaleController)
 *   GET /api/health  → JSON (HealthController)
 *   everything else  → static file, or dist/404.html with status 404
 */
export async function bootstrap(): Promise<DanetApplication> {
  try {
    await Deno.stat(join(SITE_DIST, 'index.html'));
  } catch {
    console.error(`No built site at ${SITE_DIST}. Run "deno task build:site" (or npm run build in site/) first.`);
    Deno.exit(1);
  }

  const csp = contentSecurityPolicy(await inlineScriptHashes(SITE_DIST));
  const notFoundPage = await Deno.readTextFile(join(SITE_DIST, '404.html')).catch(() => '<h1>404 Not Found</h1>');

  const app = new DanetApplication();
  // Middleware registered before init wraps every route, controllers and static files alike.
  app.use(headers(csp));
  // Compresses text responses only (Hono checks the content type); matters for the three.js chunk.
  app.use(compress());

  await app.init(AppModule);

  // After init, so the controllers above take precedence over files.
  app.useStaticAssets(SITE_DIST);
  app.router.notFound((c) => c.html(notFoundPage, 404));

  return app;
}

if (import.meta.main) {
  const app = await bootstrap();
  await app.listen(PORT);
}

import { Controller, Get, Req } from '@danet/core';
import type { HonoRequest } from '@hono/hono';
import { LocaleService } from './locale.service.ts';

@Controller('')
export class LocaleController {
  constructor(private readonly locales: LocaleService) {}

  /** GET / → 302 to /en/ or /hu/. A returned Response is sent by Danet as is. */
  @Get('/')
  redirect(@Req() req: HonoRequest): Response {
    const locale = this.locales.negotiate(req.header('cookie'), req.header('accept-language'));
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/${locale}/`,
        Vary: 'Accept-Language, Cookie',
        'Cache-Control': 'no-store',
      },
    });
  }
}

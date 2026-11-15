import { Controller, Get } from '@danet/core';

const startedAt = Date.now();

@Controller('api')
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', uptime: Math.round((Date.now() - startedAt) / 1000) };
  }
}

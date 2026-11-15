import { Module } from '@danet/core';
import { HealthController } from './health/health.controller.ts';
import { LocaleController } from './locale/locale.controller.ts';
import { LocaleService } from './locale/locale.service.ts';

@Module({
  controllers: [LocaleController, HealthController],
  injectables: [LocaleService],
})
export class AppModule {}

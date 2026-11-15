import { assertEquals } from '@std/assert';
import { LocaleService } from '../src/locale/locale.service.ts';

const svc = new LocaleService();

Deno.test('cookie wins over Accept-Language', () => {
  assertEquals(svc.negotiate('theme=dark; lang=hu', 'en-US,en;q=0.9'), 'hu');
  assertEquals(svc.negotiate('lang=en', 'hu-HU'), 'en');
});

Deno.test('unknown cookie value falls through to Accept-Language', () => {
  assertEquals(svc.negotiate('lang=de', 'hu-HU,hu;q=0.9'), 'hu');
});

Deno.test('Accept-Language: region subtags and q values', () => {
  assertEquals(svc.negotiate(null, 'hu-HU,hu;q=0.9,en;q=0.8'), 'hu');
  assertEquals(svc.negotiate(null, 'de-DE,de;q=0.9,hu;q=0.5,en;q=0.7'), 'en');
  assertEquals(svc.negotiate(null, 'en;q=0.3, hu;q=0.8'), 'hu');
  assertEquals(svc.negotiate(null, 'HU'), 'hu');
});

Deno.test('q=0 excludes a language', () => {
  assertEquals(svc.negotiate(null, 'hu;q=0, de'), 'en');
});

Deno.test('falls back to English', () => {
  assertEquals(svc.negotiate(undefined, undefined), 'en');
  assertEquals(svc.negotiate('', ''), 'en');
  assertEquals(svc.negotiate('lang=', 'fr-FR,de'), 'en');
  assertEquals(svc.negotiate(null, '*'), 'en');
});

import { assertEquals } from '@std/assert';
import { servedOverHttps } from '../src/http/headers.ts';

Deno.test('servedOverHttps: https from the proxy', () => {
  assertEquals(servedOverHttps('https'), true);
  assertEquals(servedOverHttps('HTTPS'), true);
  assertEquals(servedOverHttps('https, http'), true);
});

Deno.test('servedOverHttps: plain http or no proxy', () => {
  assertEquals(servedOverHttps('http'), false);
  assertEquals(servedOverHttps('http, https'), false);
  assertEquals(servedOverHttps(''), false);
  assertEquals(servedOverHttps(null), false);
  assertEquals(servedOverHttps(undefined), false);
});

// scripts/e2e-fidelity/mutate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectAbort } from './mutate.mjs';

const SPEC = `import { test, expect } from '@playwright/test';
test.describe('RSVP', () => {
  test('down', async ({ page }) => { await page.goto('/discover'); });
});`;

test('injectAbort inserts a route-abort beforeEach into the describe block', () => {
  const out = injectAbort(SPEC, '**/api/**');
  assert.match(out, /page\.route\(/);
  assert.match(out, /r\.abort\(\)/);
  assert.match(out, /\*\*\/api\/\*\*/);
  // inserted inside the describe body, before the existing test
  assert.ok(out.indexOf('page.route(') < out.indexOf("test('down'"));
});

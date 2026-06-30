import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPhoneForLog } from './phone-hash.js';

const PEPPER = 'test-pepper-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PHONE = '+15551234567';

test('same (phone, pepper) → identical hash', async () => {
  const a = await hashPhoneForLog(PHONE, PEPPER);
  const b = await hashPhoneForLog(PHONE, PEPPER);
  assert.equal(a, b);
});

test('output starts with h:', async () => {
  const h = await hashPhoneForLog(PHONE, PEPPER);
  assert.ok(h.startsWith('h:'));
});

test('different phones → different hashes', async () => {
  const a = await hashPhoneForLog(PHONE, PEPPER);
  const b = await hashPhoneForLog('+15557654321', PEPPER);
  assert.notEqual(a, b);
});

test('null phone → null', async () => {
  assert.equal(await hashPhoneForLog(null, PEPPER), null);
});

test('empty/absent pepper → null even with a phone', async () => {
  assert.equal(await hashPhoneForLog(PHONE, ''), null);
  assert.equal(await hashPhoneForLog(PHONE, undefined), null);
});

test('different pepper → different hash for the same phone', async () => {
  const a = await hashPhoneForLog(PHONE, PEPPER);
  const b = await hashPhoneForLog(PHONE, 'test-pepper-bbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.notEqual(a, b);
});

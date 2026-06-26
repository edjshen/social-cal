import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ready,
  generateRoomKey,
  generateRoomId,
  keyToFragment,
  keyFromFragment,
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  generateProfileKeypair,
  sign,
  verify,
  envelopeBytes,
  deriveOpenKey,
  deriveEventRoom,
} from './crypto.js';

test('encrypt/decrypt round-trips arbitrary bytes', async () => {
  await ready();
  const key = generateRoomKey();
  const msg = new TextEncoder().encode('hello mayfly 🦟');
  const ct = encrypt(msg, key);
  assert.equal(typeof ct, 'string');
  const pt = decrypt(ct, key);
  assert.deepEqual(Array.from(pt), Array.from(msg));
});

test('decrypt with wrong key throws (auth failure)', async () => {
  await ready();
  const key = generateRoomKey();
  const other = generateRoomKey();
  const ct = encrypt(new TextEncoder().encode('secret'), key);
  assert.throws(() => decrypt(ct, other));
});

test('string convenience helpers round-trip', async () => {
  await ready();
  const key = generateRoomKey();
  assert.equal(decryptString(encryptString('see you at 2am', key), key), 'see you at 2am');
});

test('key <-> fragment is a clean round-trip', async () => {
  await ready();
  const key = generateRoomKey();
  const frag = keyToFragment(key);
  assert.match(frag, /^[A-Za-z0-9_-]+$/); // base64url, no padding
  assert.deepEqual(Array.from(keyFromFragment(frag)), Array.from(key));
});

test('sign/verify detached signatures', async () => {
  await ready();
  const { publicKey, secretKey } = generateProfileKeypair();
  const bytes = new TextEncoder().encode('payload');
  const sig = sign(bytes, secretKey);
  assert.equal(verify(sig, bytes, publicKey), true);
  // Tampered payload fails.
  const tampered = new TextEncoder().encode('payloaD');
  assert.equal(verify(sig, tampered, publicKey), false);
  // Wrong key fails.
  const other = generateProfileKeypair();
  assert.equal(verify(sig, bytes, other.publicKey), false);
});

test('envelopeBytes is deterministic for the same envelope', async () => {
  await ready();
  const env = {
    roomId: 'abc',
    profilePub: 'pub',
    hlc: { wallMillis: 100, counter: 2, nodeId: 'n1' },
    kind: 'text',
    ciphertext: 'ZZZ',
  };
  assert.deepEqual(Array.from(envelopeBytes(env)), Array.from(envelopeBytes({ ...env })));
});

test('deriveEventRoom is deterministic per event key, distinct across events', async () => {
  await ready();
  const a = deriveEventRoom('edc-2026-night-1');
  const b = deriveEventRoom('edc-2026-night-1');
  assert.deepEqual(Array.from(a.idBytes), Array.from(b.idBytes));
  assert.deepEqual(Array.from(a.key), Array.from(b.key));
  assert.equal(a.idBytes.length, 16);
  assert.equal(a.key.length, 32);
  // id and key are independent (domain-separated), not equal-prefixed.
  assert.notDeepEqual(Array.from(a.idBytes), Array.from(a.key.slice(0, 16)));
  // Different event -> different room.
  const c = deriveEventRoom('edc-2026-night-2');
  assert.notDeepEqual(Array.from(a.idBytes), Array.from(c.idBytes));
});

test('deriveOpenKey is deterministic for the same words + room id', async () => {
  await ready();
  const roomId = generateRoomId();
  const a = deriveOpenKey('foo bar baz', roomId);
  const b = deriveOpenKey('foo bar baz', roomId);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.equal(a.length, 32);
  // Different words -> different key.
  const c = deriveOpenKey('foo bar qux', roomId);
  assert.notDeepEqual(Array.from(a), Array.from(c));
});

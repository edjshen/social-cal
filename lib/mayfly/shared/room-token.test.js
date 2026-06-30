import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintRoomToken, verifyRoomToken } from './room-token.js';

const ROOM = 'AbCdEf0123456789AbCdEf01';
const OTHER = 'ZyXwVu9876543210ZyXwVu98';
const KEY = 'test-relay-secret-aaaaaaaaaaaaaaaaaaaaaaaa';

test('round-trips for the same room', async () => {
  const token = await mintRoomToken(KEY, ROOM);
  assert.equal(await verifyRoomToken(KEY, ROOM, token), true);
});

test('rejects a token minted for a different room', async () => {
  const token = await mintRoomToken(KEY, OTHER);
  assert.equal(await verifyRoomToken(KEY, ROOM, token), false);
});

test('rejects an already-expired token (negative ttl)', async () => {
  const token = await mintRoomToken(KEY, ROOM, -1000);
  assert.equal(await verifyRoomToken(KEY, ROOM, token), false);
});

test('accepts before expiry, rejects after — at a fixed clock', async () => {
  const now = 1_000_000_000_000;
  const token = await mintRoomToken(KEY, ROOM, 1000, now);
  assert.equal(await verifyRoomToken(KEY, ROOM, token, now + 500), true);
  assert.equal(await verifyRoomToken(KEY, ROOM, token, now + 2000), false);
});

test('rejects a token signed with a different secret', async () => {
  const token = await mintRoomToken('other-secret-bbbbbbbbbbbbbbbbbbbbbbbb', ROOM);
  assert.equal(await verifyRoomToken(KEY, ROOM, token), false);
});

test('rejects a tampered signature', async () => {
  const token = await mintRoomToken(KEY, ROOM);
  const dot = token.indexOf('.');
  const tampered = `${token.slice(0, dot + 1)}AAAA${token.slice(dot + 1)}`;
  assert.equal(await verifyRoomToken(KEY, ROOM, tampered), false);
});

test('rejects a tampered expiry (exp is signed)', async () => {
  const token = await mintRoomToken(KEY, ROOM, 1000);
  const sig = token.slice(token.indexOf('.') + 1);
  const farFuture = Date.now() + 999_999_999;
  const forged = `${farFuture}.${sig}`;
  assert.equal(await verifyRoomToken(KEY, ROOM, forged), false);
});

test('returns false (no throw) for malformed inputs', async () => {
  for (const bad of [null, undefined, '', 'nodot', '.', 'abc.', '.abc', 123]) {
    assert.equal(await verifyRoomToken(KEY, ROOM, bad), false);
  }
});

test('an empty secret never verifies', async () => {
  const token = await mintRoomToken(KEY, ROOM);
  assert.equal(await verifyRoomToken('', ROOM, token), false);
});

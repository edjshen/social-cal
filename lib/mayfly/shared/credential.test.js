import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFragment, buildRoomUrl, parseFragment } from './credential.js';

test('build -> parse round-trips a credential', () => {
  const frag = buildFragment('roomid_b64', 'roomkey_b64');
  const parsed = parseFragment(frag);
  assert.deepEqual(parsed, {
    id: 'roomid_b64',
    k: 'roomkey_b64',
    v: 1,
    event: false,
    expiresAt: null,
  });
});

test('carries optional event + expiry fields', () => {
  const exp = 1893456000000;
  const frag = buildFragment('AAAA', 'BBBB', { event: true, expiresAt: exp });
  assert.match(frag, /e=1/);
  assert.match(frag, new RegExp(`x=${exp}`));
  assert.deepEqual(parseFragment(frag), {
    id: 'AAAA',
    k: 'BBBB',
    v: 1,
    event: true,
    expiresAt: exp,
  });
  // Absent optionals default cleanly.
  const plain = parseFragment(buildFragment('AAAA', 'BBBB'));
  assert.equal(plain.event, false);
  assert.equal(plain.expiresAt, null);
  // A non-numeric x is ignored, not fatal.
  assert.equal(parseFragment('i=AAAA&k=BBBB&v=1&x=nope').expiresAt, null);
});

test('parses a leading # and a full URL', () => {
  const frag = buildFragment('AAAA', 'BBBB');
  assert.ok(parseFragment(`#${frag}`));
  assert.deepEqual(parseFragment(`https://orbit.junting-mp3.workers.dev/rooms#${frag}`), {
    id: 'AAAA',
    k: 'BBBB',
    v: 1,
    event: false,
    expiresAt: null,
  });
});

test('buildRoomUrl shape', () => {
  const url = buildRoomUrl('AAAA', 'BBBB', 'https://orbit.junting-mp3.workers.dev');
  assert.equal(url, 'https://orbit.junting-mp3.workers.dev/rooms#i=AAAA&k=BBBB&v=1');
  // Trailing slash on origin is tolerated.
  assert.equal(buildRoomUrl('AAAA', 'BBBB', 'https://orbit.junting-mp3.workers.dev/'), url);
});

test('rejects unknown versions and malformed payloads', () => {
  assert.equal(parseFragment('i=AAAA&k=BBBB&v=2'), null); // unknown version
  assert.equal(parseFragment('i=AAAA&k=BBBB'), null); // missing v
  assert.equal(parseFragment('i=AAAA&v=1'), null); // missing k
  assert.equal(parseFragment('k=BBBB&v=1'), null); // missing i
  assert.equal(parseFragment('i=has space&k=BBBB&v=1'), null); // non-base64url id
  assert.equal(parseFragment(''), null);
  assert.equal(parseFragment(null), null);
  assert.equal(parseFragment('garbage'), null);
});

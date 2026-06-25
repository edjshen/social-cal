import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientFrame, parseServerFrame } from './protocol.js';

const hlc = { wallMillis: 1, counter: 0, nodeId: 'n' };

test('accepts well-formed client frames', () => {
  assert.ok(parseClientFrame({ type: 'ping' }));
  assert.ok(parseClientFrame({ type: 'hello', resumeFromSeq: 5, profilePub: 'p' }));
  assert.ok(parseClientFrame({ type: 'hello', resumeFromSeq: null, profilePub: 'p' }));
  assert.ok(
    parseClientFrame({
      type: 'publish',
      id: 'uuid',
      hlc,
      kind: 'text',
      ciphertext: 'c',
      sig: 's',
      profilePub: 'p',
    })
  );
});

test('rejects malformed / unknown client frames', () => {
  assert.equal(parseClientFrame('not json'), null);
  assert.equal(parseClientFrame({ type: 'nope' }), null);
  assert.equal(parseClientFrame({ type: 'publish', id: 'x' }), null); // missing fields
  assert.equal(
    parseClientFrame({
      type: 'publish',
      id: 'x',
      hlc,
      kind: 'bogus',
      ciphertext: 'c',
      sig: 's',
      profilePub: 'p',
    }),
    null
  );
  assert.equal(parseClientFrame({ type: 'hello', resumeFromSeq: 'five', profilePub: 'p' }), null);
});

test('accepts well-formed server frames', () => {
  assert.ok(
    parseServerFrame({ type: 'welcome', createdAt: 1, expiresAt: 2, serverNow: 1, latestSeq: 0 })
  );
  assert.ok(parseServerFrame({ type: 'ack', id: 'x', seq: 3 }));
  assert.ok(parseServerFrame({ type: 'backlog_done', latestSeq: 9 }));
  assert.ok(parseServerFrame({ type: 'expired' }));
  assert.ok(parseServerFrame({ type: 'pong', serverNow: 5 }));
  assert.ok(
    parseServerFrame({
      type: 'event',
      seq: 1,
      id: 'x',
      hlc,
      kind: 'reaction',
      ciphertext: 'c',
      sig: 's',
      profilePub: 'p',
    })
  );
});

test('rejects malformed server frames', () => {
  assert.equal(parseServerFrame('{bad'), null);
  assert.equal(parseServerFrame({ type: 'ack', id: 'x' }), null);
  assert.equal(
    parseServerFrame({
      type: 'event',
      seq: 'one',
      id: 'x',
      hlc,
      kind: 'text',
      ciphertext: 'c',
      sig: 's',
      profilePub: 'p',
    }),
    null
  );
});

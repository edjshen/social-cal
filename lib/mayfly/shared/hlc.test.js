import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HybridLogicalClock, compareHLC, encodeHLC } from './hlc.js';

test('now() is strictly monotonic within a device', () => {
  const c = new HybridLogicalClock('node-a');
  let prev = c.now();
  for (let i = 0; i < 1000; i++) {
    const next = c.now();
    assert.equal(compareHLC(prev, next) < 0, true, `tick ${i} not increasing`);
    prev = next;
  }
});

test('observe() keeps causality after seeing a future remote stamp', () => {
  const c = new HybridLogicalClock('node-a');
  const future = { wallMillis: Date.now() + 60_000, counter: 5, nodeId: 'node-b' };
  c.observe(future);
  const local = c.now();
  // Local stamp must be strictly after the observed remote one.
  assert.equal(compareHLC(future, local) < 0, true);
});

test('compareHLC is a total order (tie-break on nodeId)', () => {
  const a = { wallMillis: 10, counter: 1, nodeId: 'aaa' };
  const b = { wallMillis: 10, counter: 1, nodeId: 'bbb' };
  assert.equal(compareHLC(a, b) < 0, true);
  assert.equal(compareHLC(b, a) > 0, true);
  assert.equal(compareHLC(a, { ...a }), 0);
  // wall dominates counter dominates nodeId.
  assert.equal(compareHLC({ wallMillis: 11, counter: 0, nodeId: 'a' }, a) > 0, true);
  assert.equal(compareHLC({ wallMillis: 10, counter: 2, nodeId: 'a' }, a) > 0, true);
});

test('encodeHLC string order matches compareHLC for same nodeId', () => {
  const xs = [
    { wallMillis: 5, counter: 9, nodeId: 'n' },
    { wallMillis: 5, counter: 10, nodeId: 'n' },
    { wallMillis: 6, counter: 0, nodeId: 'n' },
    { wallMillis: 4096, counter: 1, nodeId: 'n' },
  ];
  const sorted = [...xs].sort(compareHLC);
  const byString = [...xs].sort((a, b) => (encodeHLC(a) < encodeHLC(b) ? -1 : 1));
  assert.deepEqual(sorted, byString);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORDLIST,
  roomIdToWords,
  wordsToRoomId,
  isValidThreeWords,
  normalizeWords,
} from './wordlist.js';

test('wordlist is exactly 2048 unique words', () => {
  assert.equal(WORDLIST.length, 2048);
  assert.equal(new Set(WORDLIST).size, 2048);
  assert.ok(WORDLIST.every((w) => /^[a-z]+$/.test(w)));
});

test('three-words round-trips the first 33 bits of a room id', () => {
  for (let trial = 0; trial < 200; trial++) {
    const id = new Uint8Array(16);
    for (let i = 0; i < 16; i++) id[i] = Math.floor(Math.random() * 256);
    const words = roomIdToWords(id);
    const back = wordsToRoomId(words);
    // First 4 bytes identical; top bit of byte 4 identical; rest zeroed.
    assert.deepEqual(Array.from(back.slice(0, 4)), Array.from(id.slice(0, 4)));
    assert.equal(back[4] & 0x80, id[4] & 0x80);
    assert.deepEqual(Array.from(back.slice(5)), new Array(11).fill(0));
    // And re-deriving words from the reconstructed id gives the same phrase.
    assert.equal(roomIdToWords(back), words);
  }
});

test('wordsToRoomId is tolerant of separators and casing', () => {
  const id = new Uint8Array(16);
  id[0] = 0xab;
  id[1] = 0xcd;
  const words = roomIdToWords(id);
  const upperDashed = words.toUpperCase().replace(/ /g, '-');
  assert.deepEqual(Array.from(wordsToRoomId(upperDashed)), Array.from(wordsToRoomId(words)));
});

test('isValidThreeWords / normalizeWords', () => {
  const id = new Uint8Array(16);
  const words = roomIdToWords(id);
  assert.equal(isValidThreeWords(words), true);
  assert.equal(isValidThreeWords('only two'), false);
  assert.equal(isValidThreeWords('zzzzz qqqqq xxxxx'), false);
  assert.deepEqual(normalizeWords('  Foo-Bar, baz '), ['foo', 'bar', 'baz']);
});

test('unknown word throws', () => {
  assert.throws(() => wordsToRoomId('definitely notaword here'));
});

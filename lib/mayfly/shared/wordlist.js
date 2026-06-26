/**
 * Three-word room locator. 2048 words = 11 bits each; three words encode the
 * room id's first 33 bits. The wordlist is generated deterministically from
 * consonant–vowel–consonant syllables so the bijection is provably exact and
 * offline, identical on every device (pure code, no data file to drift).
 *
 * The 2048-word space and the index<->word mapping are a stable PROTOCOL
 * surface: swapping in a hand-curated list later is fine, but it must keep
 * exactly 2048 unique words in a fixed order or existing three-word names break.
 *
 * Three-words is a LOCATOR, never a key:
 *  - Sealed rooms (random key): the words are a spoken label only; you still
 *    need the full fragment (chirp/link/NFC) to join.
 *  - Open rooms: the room id IS its three words (33 bits, zero-padded to 16
 *    bytes) and the key is derived from words+id, so anyone who hears the words
 *    can join. Use only for loud public circles where privacy isn't the point.
 */

const ONSETS = ['b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z'];
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'oo', 'ee', 'ay'];
const CODAS = [
  'b',
  'd',
  'ck',
  'ff',
  'g',
  'll',
  'm',
  'n',
  'p',
  'r',
  'ss',
  't',
  'v',
  'z',
  'sh',
  'ng',
];

function buildWordlist() {
  const words = [];
  // 16 × 8 × 16 = 2048, in a fixed nested order.
  for (const on of ONSETS) {
    for (const nu of NUCLEI) {
      for (const co of CODAS) {
        words.push(on + nu + co);
      }
    }
  }
  if (words.length !== 2048) {
    throw new Error(`mayfly wordlist: expected 2048 words, got ${words.length}`);
  }
  if (new Set(words).size !== 2048) {
    throw new Error('mayfly wordlist: words are not unique');
  }
  return words;
}

export const WORDLIST = Object.freeze(buildWordlist());

const INDEX_OF = new Map(WORDLIST.map((w, i) => [w, i]));

const ROOM_ID_BYTES = 16;

/** Read the first 33 bits of a 16-byte room id as a BigInt (big-endian). */
function topBits(roomId) {
  let n = 0n;
  // First 4 bytes (32 bits) + the top bit of byte 4.
  for (let i = 0; i < 4; i++) n = (n << 8n) | BigInt(roomId[i]);
  n = (n << 1n) | BigInt((roomId[4] >> 7) & 1);
  return n; // 33-bit value
}

/** Pack a 33-bit BigInt into the first 33 bits of a fresh 16-byte room id. */
function fromTopBits(n) {
  const out = new Uint8Array(ROOM_ID_BYTES);
  const b4bit = Number(n & 1n);
  n >>= 1n;
  for (let i = 3; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  out[4] = b4bit << 7;
  return out;
}

/** Room id (Uint8Array, >=5 bytes) -> three lowercase words joined by spaces. */
export function roomIdToWords(roomId) {
  const n = topBits(roomId);
  const i0 = Number((n >> 22n) & 0x7ffn);
  const i1 = Number((n >> 11n) & 0x7ffn);
  const i2 = Number(n & 0x7ffn);
  return [WORDLIST[i0], WORDLIST[i1], WORDLIST[i2]].join(' ');
}

/**
 * Three words -> a deterministic 16-byte room id (33 bits set, rest zero).
 * Tolerant of separators (spaces, dashes, commas) and casing. Throws on any
 * word not in the list.
 */
export function wordsToRoomId(words) {
  const parts = normalizeWords(words);
  if (parts.length !== 3) {
    throw new Error(`mayfly three-words: expected 3 words, got ${parts.length}`);
  }
  let n = 0n;
  for (const w of parts) {
    const idx = INDEX_OF.get(w);
    if (idx === undefined) throw new Error(`mayfly three-words: unknown word "${w}"`);
    n = (n << 11n) | BigInt(idx);
  }
  // n now holds 33 bits.
  return fromTopBits(n);
}

/** Split/clean a spoken or typed phrase into normalized word tokens. */
export function normalizeWords(words) {
  return String(words)
    .toLowerCase()
    .split(/[\s,\-_.]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** True if every token is a valid wordlist word (and there are exactly 3). */
export function isValidThreeWords(words) {
  const parts = normalizeWords(words);
  return parts.length === 3 && parts.every((w) => INDEX_OF.has(w));
}

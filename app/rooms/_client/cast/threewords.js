/**
 * Three-word cast/catch. Resolution is exact and offline (see wordlist.js).
 * Speech recognition is offered where available, but typing is always the
 * dependable path.
 *
 * Three-words is a LOCATOR, not a key:
 *  - For a sealed room it's a spoken label; joining still needs the full
 *    fragment from chirp/link/NFC.
 *  - For an open room the words deterministically reproduce the id AND key
 *    (via resolveOpenWords in store/rooms.js).
 */
import { roomIdToWords, isValidThreeWords, normalizeWords } from '@/lib/mayfly/shared/wordlist.js';
import { fromB64 } from '@/lib/mayfly/shared/crypto.js';

/** Display words for a room (id is base64url). */
export function wordsForRoom(room) {
  return room.words || roomIdToWords(fromB64(room.id));
}

export { isValidThreeWords, normalizeWords };

/** Web Speech API support (Chrome / some mobile). */
export function speechSupported() {
  return (
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition) != null
  );
}

/**
 * Listen once for a spoken three-word phrase. Resolves with the recognized
 * transcript string (caller validates with isValidThreeWords). Rejects on
 * error/no-support. Must be triggered by a user gesture.
 */
export function listenForWords() {
  return new Promise((resolve, reject) => {
    const Ctor =
      typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Ctor) {
      reject(new Error('speech recognition unsupported'));
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      // Prefer the first alternative that parses as three valid words.
      for (const alt of e.results[0]) {
        if (isValidThreeWords(alt.transcript)) {
          resolve(normalizeWords(alt.transcript).join(' '));
          return;
        }
      }
      resolve(e.results[0][0].transcript);
    };
    rec.onerror = (e) => reject(new Error(e.error || 'speech error'));
    rec.onend = () => {
      /* resolution handled in onresult */
    };
    try {
      rec.start();
    } catch (err) {
      reject(err);
    }
  });
}

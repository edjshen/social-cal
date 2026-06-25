/**
 * Hybrid Logical Clock. Chat is an append-only event log; HLC gives causal
 * order while staying close to wall-clock time, so ordering matches human
 * intuition without trusting any single device's skewed clock.
 *
 * `nodeId` is a short random per-DEVICE id (not the profile id), stable for the
 * device's lifetime. Shared module — pure, no environment globals.
 *
 * @typedef {Object} HLCTimestamp
 * @property {number} wallMillis
 * @property {number} counter
 * @property {string} nodeId
 */

export class HybridLogicalClock {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.lastWall = 0;
    this.counter = 0;
  }

  /** @returns {HLCTimestamp} */
  now() {
    const physical = Date.now();
    if (physical > this.lastWall) {
      this.lastWall = physical;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return { wallMillis: this.lastWall, counter: this.counter, nodeId: this.nodeId };
  }

  /** Advance the clock on observing a remote timestamp. */
  observe(remote) {
    const physical = Date.now();
    const maxWall = Math.max(physical, this.lastWall, remote.wallMillis);
    if (maxWall === this.lastWall && maxWall === remote.wallMillis) {
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else if (maxWall === this.lastWall) {
      this.counter += 1;
    } else if (maxWall === remote.wallMillis) {
      this.counter = remote.counter + 1;
    } else {
      this.counter = 0;
    }
    this.lastWall = maxWall;
  }
}

/** Total order over HLC timestamps (nodeId breaks ties). */
export function compareHLC(a, b) {
  if (a.wallMillis !== b.wallMillis) return a.wallMillis - b.wallMillis;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}

/**
 * Lexicographically-sortable string encoding. Padded hex so string comparison
 * matches compareHLC for the wall/counter components; nodeId appended for tie
 * break. Used as the IndexedDB `by-room-hlc` index key.
 */
export function encodeHLC(t) {
  const w = t.wallMillis.toString(16).padStart(12, '0');
  const c = t.counter.toString(16).padStart(4, '0');
  return `${w}:${c}:${t.nodeId}`;
}

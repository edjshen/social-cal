/**
 * Jittered exponential backoff. Kills thundering-herd reconnects when a
 * congested tower at a 300-person event recovers and every phone retries at
 * once. Base 500ms, doubling, capped at 30s, fully jittered.
 */
export function backoffDelay(attempt) {
  const base = 500;
  const cap = 30000;
  const expo = Math.min(cap, base * 2 ** attempt);
  return Math.random() * expo;
}

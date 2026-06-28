export function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}
export function startOfDay(iso: string | Date) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}
export function notExpired(ev: { expiresAt: string | null }, now = new Date()) {
  return !ev.expiresAt || new Date(ev.expiresAt) > now;
}

import { CalEvent, DAY_MS, addDays, startOfDay } from './util';

// Local YYYY-MM-DD for an instant — the occurrence key. Must match the server's
// dateKey interpretation (lib/actions/events.ts occurrenceStartISO, which sets
// the date components in local time).
function localDateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Expand stored events into concrete occurrences overlapping [rangeStart,
// rangeEnd), honoring per-instance recurrence exceptions:
//  - cancellation rows (cancelled=true) remove their occurrence,
//  - override rows (parentId set) replace their occurrence with edited values,
//  - a base's recurUntil stops generation at/after that instant.
export function expandEvents(events: CalEvent[], rangeStart: Date, rangeEnd: Date): CalEvent[] {
  const out: CalEvent[] = [];
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  // Partition into bases, overrides and cancellations.
  const bases: CalEvent[] = [];
  const overrides: CalEvent[] = [];
  const exMap = new Map<string, Set<string>>(); // seriesId -> exception dateKeys
  const addEx = (seriesId?: string | null, date?: string | null) => {
    if (!seriesId || !date) return;
    if (!exMap.has(seriesId)) exMap.set(seriesId, new Set());
    exMap.get(seriesId)!.add(date);
  };
  for (const ev of events) {
    if (ev.cancelled) {
      addEx(ev.parentId, ev.originalDate);
    } else if (ev.parentId) {
      overrides.push(ev);
      addEx(ev.parentId, ev.originalDate); // an override also suppresses the generated occurrence
    } else {
      bases.push(ev);
    }
  }

  for (const ev of bases) {
    const baseStart = new Date(ev.startTime);
    const baseEnd = ev.endTime ? new Date(ev.endTime) : new Date(baseStart.getTime() + 60 * 60000);
    const dur = baseEnd.getTime() - baseStart.getTime();

    if (!ev.recurring) {
      if (baseEnd.getTime() > startMs && baseStart.getTime() < endMs) out.push(ev);
      continue;
    }

    const ex = exMap.get(ev.id);
    const until = ev.recurUntil ? new Date(ev.recurUntil).getTime() : Infinity;

    // Walk occurrences forward, fast-forwarding close to the range first. Cap the
    // iteration count as a safety valve against pathological inputs.
    let cursor = fastForward(ev.recurring, baseStart, rangeStart);
    let guard = 0;
    while (cursor.getTime() < endMs && guard++ < 800) {
      const occStart = cursor.getTime();
      if (occStart >= until) break;
      const occEnd = occStart + dur;
      const dateKey = localDateKey(occStart);
      if (occEnd > startMs && occStart < endMs && !(ex && ex.has(dateKey))) {
        out.push({
          ...ev,
          startTime: new Date(occStart).toISOString(),
          endTime: new Date(occEnd).toISOString(),
          seriesId: ev.id,
          id: `${ev.id}__${dateKey}`,
          occurrence: true,
        });
      }
      cursor = nextOccurrence(ev.recurring, cursor);
    }
  }

  // Override instances render at their own (edited) time as one-off events.
  for (const ov of overrides) {
    const s = new Date(ov.startTime).getTime();
    const e = ov.endTime ? new Date(ov.endTime).getTime() : s + 60 * 60000;
    if (e > startMs && s < endMs) out.push({ ...ov, seriesId: ov.parentId || undefined });
  }

  return out;
}

function nextOccurrence(freq: string, d: Date): Date {
  const x = new Date(d);
  switch (freq) {
    case 'daily':
      x.setDate(x.getDate() + 1);
      break;
    case 'weekly':
      x.setDate(x.getDate() + 7);
      break;
    case 'weekday':
      do {
        x.setDate(x.getDate() + 1);
      } while (x.getDay() === 0 || x.getDay() === 6);
      break;
    case 'monthly':
      x.setMonth(x.getMonth() + 1);
      break;
    case 'yearly':
      x.setFullYear(x.getFullYear() + 1);
      break;
    default:
      x.setDate(x.getDate() + 7);
  }
  return x;
}

// Jump the cursor to roughly the start of the visible range without losing the
// recurrence phase (preserves time-of-day; re-aligns to the correct cadence).
function fastForward(freq: string, base: Date, rangeStart: Date): Date {
  if (rangeStart.getTime() <= base.getTime()) return new Date(base);
  const x = new Date(base);
  if (freq === 'daily' || freq === 'weekday') {
    const days =
      Math.floor((startOfDay(rangeStart).getTime() - startOfDay(base).getTime()) / DAY_MS) - 2;
    if (days > 0) x.setDate(x.getDate() + days);
    // settle onto a valid weekday for 'weekday'
    while (freq === 'weekday' && (x.getDay() === 0 || x.getDay() === 6)) x.setDate(x.getDate() + 1);
    return x;
  }
  if (freq === 'weekly') {
    const weeks = Math.floor((rangeStart.getTime() - base.getTime()) / (7 * DAY_MS)) - 1;
    if (weeks > 0) x.setDate(x.getDate() + weeks * 7);
    return x;
  }
  if (freq === 'monthly') {
    while (addDays(x, 0).getTime() < rangeStart.getTime()) {
      const prev = x.getTime();
      x.setMonth(x.getMonth() + 1);
      if (x.getTime() === prev) break;
      // step back one so the while-loop in caller re-checks the boundary cleanly
      if (x.getTime() >= rangeStart.getTime()) {
        x.setMonth(x.getMonth() - 1);
        break;
      }
    }
    return x;
  }
  if (freq === 'yearly') {
    const years = rangeStart.getFullYear() - base.getFullYear() - 1;
    if (years > 0) x.setFullYear(x.getFullYear() + years);
    return x;
  }
  return x;
}

// ---- overlap layout: assign each timed event a column within its overlap cluster
export type LaidOut = CalEvent & { _col: number; _cols: number };

export function layoutDay(events: CalEvent[]): LaidOut[] {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
      new Date(b.endTime || b.startTime).getTime() - new Date(a.endTime || a.startTime).getTime()
  );
  const result: LaidOut[] = [];
  let cluster: LaidOut[] = [];
  let clusterEnd = 0;

  const flush = () => {
    if (!cluster.length) return;
    // assign columns greedily
    const colEnds: number[] = [];
    for (const ev of cluster) {
      const s = new Date(ev.startTime).getTime();
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (s >= colEnds[c]) {
          ev._col = c;
          colEnds[c] = new Date(ev.endTime || ev.startTime).getTime();
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = colEnds.length;
        colEnds.push(new Date(ev.endTime || ev.startTime).getTime());
      }
    }
    const cols = colEnds.length;
    cluster.forEach((ev) => (ev._cols = cols));
    result.push(...cluster);
    cluster = [];
  };

  for (const ev of sorted) {
    const s = new Date(ev.startTime).getTime();
    const e = new Date(ev.endTime || ev.startTime).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    cluster.push({ ...(ev as any), _col: 0, _cols: 1 });
    clusterEnd = Math.max(clusterEnd, e);
    if (cluster.length === 1) clusterEnd = e;
  }
  flush();
  return result;
}

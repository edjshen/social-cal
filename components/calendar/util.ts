// Date + color helpers for the Google-Calendar-style tab. Everything works in
// the viewer's local time zone (events are stored as ISO instants).

export type CalEvent = {
  id: string;
  type: string;
  title?: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime?: string | null;
  recurring?: string | null;
  allDay?: boolean;
  color?: string | null;
  visibility?: string;
  busy?: boolean;
  creator?: {
    id: string;
    displayName?: string;
    handle?: string;
    initials?: string;
    avatar?: string;
  } | null;
  proof?: { count: number; sample?: any[] };
  myRsvp?: string | null;
  attendeeCount?: number;
  // Per-instance recurrence exception fields:
  parentId?: string | null;
  originalDate?: string | null;
  cancelled?: boolean;
  recurUntil?: string | null;
  // Synthetic fields added during recurrence expansion:
  seriesId?: string;
  occurrence?: boolean;
};

export const DAY_MS = 86400000;
export const MIN_MS = 60000;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function startOfDay(d: Date | string | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
// US-style week starts on Sunday.
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function sameDay(a: Date | string | number, b: Date | string | number): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}
export function minutesInto(iso: string | Date): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
// minutes for a datetime relative to a given day's midnight (can exceed 1440 / be < 0)
export function minutesFromDayStart(iso: string | Date, day: Date): number {
  return (new Date(iso).getTime() - startOfDay(day).getTime()) / MIN_MS;
}

export function fmtTime(iso: string | Date): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
export function fmtHour(h: number): string {
  if (h === 0 || h === 24) return '';
  const ap = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh} ${ap}`;
}
// value for an <input type=datetime-local> from a Date (local, no tz suffix)
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// --- colors -------------------------------------------------------------
// Google-Calendar-style named palette. Keys are stored in events.color.
export const CAL_COLORS: { key: string; name: string; hex: string }[] = [
  { key: 'tomato', name: 'Tomato', hex: '#FF6B6B' },
  { key: 'flamingo', name: 'Flamingo', hex: '#FF8FA3' },
  { key: 'tangerine', name: 'Tangerine', hex: '#FF7A59' },
  { key: 'banana', name: 'Banana', hex: '#F6C453' },
  { key: 'sage', name: 'Sage', hex: '#7FCFA0' },
  { key: 'basil', name: 'Basil', hex: '#3F9E78' },
  { key: 'peacock', name: 'Peacock', hex: '#4FB6C9' },
  { key: 'blueberry', name: 'Blueberry', hex: '#6E8AFF' },
  { key: 'lavender', name: 'Lavender', hex: '#9B8CFF' },
  { key: 'grape', name: 'Grape', hex: '#B06CD6' },
  { key: 'graphite', name: 'Graphite', hex: '#8A8694' },
];

// Default color per event type (used when no explicit color stored).
const TYPE_COLOR: Record<string, string> = {
  intention: 'sage',
  plan: 'lavender',
  event: 'tangerine',
  scene: 'banana',
  busy: 'graphite',
};

export function eventColorHex(ev: CalEvent): string {
  if (ev.busy) return '#8A8694';
  const key = ev.color || TYPE_COLOR[ev.type] || 'tangerine';
  return CAL_COLORS.find((c) => c.key === key)?.hex || '#FF7A59';
}

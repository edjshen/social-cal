// Shared, framework-free helpers for custom orbits (group calendars).

// Valid orbit color keys. Mirrors the CAL_COLORS palette in
// components/calendar/util.ts (kept as a small standalone list so server actions
// can validate a color without importing client-side calendar code).
export const CAL_COLOR_KEYS = [
  'tomato',
  'flamingo',
  'tangerine',
  'banana',
  'sage',
  'basil',
  'peacock',
  'blueberry',
  'lavender',
  'grape',
  'graphite',
] as const;

export type OrbitColorKey = (typeof CAL_COLOR_KEYS)[number];

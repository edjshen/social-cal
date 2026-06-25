// Shared pure helpers (no db access) used by the API and the seed script.
const PALETTE = [
  ['#FF8A5B', '#FF5E87'],
  ['#5FD3A6', '#3FA7C2'],
  ['#9B8CFF', '#6C7BFF'],
  ['#FFC178', '#FF8A5B'],
  ['#FF5E87', '#9B8CFF'],
  ['#5FD3A6', '#6C7BFF'],
  ['#FFC178', '#FF5E87'],
  ['#9B8CFF', '#FF5E87'],
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarFor(seed) {
  return PALETTE[hash(seed) % PALETTE.length].join(',');
}

function initials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Event "type" → semantic colour key used across the UI.
const TYPES = ['intention', 'plan', 'event', 'scene'];

module.exports = { PALETTE, avatarFor, initials, TYPES };

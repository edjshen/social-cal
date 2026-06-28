import type { PublicUser } from './types';

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
function hash(s: string) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export function avatarFor(seed: string) {
  return PALETTE[hash(seed) % PALETTE.length].join(',');
}
export function initials(name: string) {
  return (
    (name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}
export function publicUser<
  T extends { id: string; handle: string; displayName: string; avatar: string },
>(u: T | null): PublicUser | null {
  if (!u) return null;
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatar: u.avatar,
    initials: initials(u.displayName),
  };
}

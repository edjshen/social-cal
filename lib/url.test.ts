import { describe, it, expect } from 'vitest';
import { safeNext, withNext } from './url';

describe('safeNext', () => {
  it('accepts same-origin relative paths', () => {
    expect(safeNext('/e/abc123')).toBe('/e/abc123');
    expect(safeNext('/u/maya')).toBe('/u/maya');
    expect(safeNext('/discover?tab=week')).toBe('/discover?tab=week');
  });

  it('rejects protocol-relative and backslash open-redirect tricks', () => {
    expect(safeNext('//evil.com')).toBeNull();
    expect(safeNext('/\\evil.com')).toBeNull();
  });

  it('rejects absolute URLs and non-path values', () => {
    expect(safeNext('https://evil.com')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
    expect(safeNext('e/abc')).toBeNull();
    expect(safeNext('')).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(42)).toBeNull();
  });

  it('rejects absurdly long inputs', () => {
    expect(safeNext('/' + 'a'.repeat(600))).toBeNull();
  });
});

describe('withNext', () => {
  it('appends an encoded next when valid', () => {
    expect(withNext('/login', '/e/abc')).toBe('/login?next=%2Fe%2Fabc');
    expect(withNext('/register', '/u/maya?x=1')).toBe('/register?next=%2Fu%2Fmaya%3Fx%3D1');
  });

  it('falls back to the bare path when next is missing or unsafe', () => {
    expect(withNext('/login', undefined)).toBe('/login');
    expect(withNext('/login', '//evil.com')).toBe('/login');
  });
});

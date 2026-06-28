import { describe, it, expect } from 'vitest';
import { initials, avatarFor, publicUser } from './helpers';

describe('helpers', () => {
  it('initials: first two words, uppercased', () => {
    expect(initials('Ed Shen')).toBe('ES');
    expect(initials('plur')).toBe('P');
    expect(initials('')).toBe('?');
  });
  it('avatarFor: stable two-color gradient string', () => {
    expect(avatarFor('ed')).toBe(avatarFor('ed'));
    expect(avatarFor('ed').split(',').length).toBe(2);
  });
  it('publicUser: projects safe fields + initials', () => {
    const u = { id: '1', handle: 'ed', displayName: 'Ed Shen', avatar: 'a,b', passwordHash: 'x' };
    expect(publicUser(u as any)).toEqual({
      id: '1',
      handle: 'ed',
      displayName: 'Ed Shen',
      avatar: 'a,b',
      initials: 'ES',
    });
  });
});

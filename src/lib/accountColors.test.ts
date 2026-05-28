import { describe, it, expect } from 'vitest';
import { colorForAccount } from './accountColors';

describe('colorForAccount', () => {
  it('is stable for the same id', () => {
    const id = 'acc-123';
    expect(colorForAccount(id)).toBe(colorForAccount(id));
  });

  it('returns a valid hsl color string', () => {
    expect(colorForAccount('anything')).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  });

  it('produces different colors for different ids', () => {
    const ids = ['a', 'b', 'c', 'd', 'work-account', 'personal-account'];
    const colors = ids.map(colorForAccount);
    const unique = new Set(colors);
    // Not every pair must differ (palette is finite), but a small set of
    // distinct ids should yield more than one hue.
    expect(unique.size).toBeGreaterThan(1);
  });

  it('distinguishes two specific accounts', () => {
    expect(colorForAccount('work@corp.com')).not.toBe(colorForAccount('me@gmail.com'));
  });
});

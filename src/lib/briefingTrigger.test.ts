import { describe, it, expect } from 'vitest';
import { shouldAutoGenerate, todayStr } from './briefingTrigger';

// A fixed local date helper: 2026-05-27 at HH:MM.
function at(h: number, m: number): Date {
  return new Date(2026, 4, 27, h, m, 0, 0); // month is 0-based (4 = May)
}

describe('todayStr', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(todayStr(new Date(2026, 0, 5, 1, 2))).toBe('2026-01-05');
    expect(todayStr(at(8, 30))).toBe('2026-05-27');
  });
});

describe('shouldAutoGenerate', () => {
  it('AE1: now=08:30, morning=06:00, last≠today → true', () => {
    expect(
      shouldAutoGenerate({ now: at(8, 30), morningTime: '06:00', lastBriefingDate: '2026-05-26' }),
    ).toBe(true);
  });

  it('AE1b: last is null (never generated) and past morning → true', () => {
    expect(
      shouldAutoGenerate({ now: at(8, 30), morningTime: '06:00', lastBriefingDate: null }),
    ).toBe(true);
  });

  it('AE2: last===today → false (only one per day)', () => {
    expect(
      shouldAutoGenerate({ now: at(8, 30), morningTime: '06:00', lastBriefingDate: '2026-05-27' }),
    ).toBe(false);
  });

  it('AE3: now=05:30 < morning=06:00 → false', () => {
    expect(
      shouldAutoGenerate({ now: at(5, 30), morningTime: '06:00', lastBriefingDate: '2026-05-26' }),
    ).toBe(false);
  });

  it('exactly at morning time counts as eligible', () => {
    expect(
      shouldAutoGenerate({ now: at(6, 0), morningTime: '06:00', lastBriefingDate: '2026-05-26' }),
    ).toBe(true);
  });

  it('invalid morningTime → treated as always-eligible (when not yet generated today)', () => {
    expect(
      shouldAutoGenerate({ now: at(0, 1), morningTime: 'nonsense', lastBriefingDate: null }),
    ).toBe(true);
  });
});

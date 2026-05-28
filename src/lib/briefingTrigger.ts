/**
 * Pure logic for deciding when the morning briefing should auto-generate.
 *
 * Rule: generate on the first open of the day, once we're past the configured
 * morning time, and only if we haven't already generated today.
 */

/** Local "YYYY-MM-DD" for the given date (defaults to now). */
export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Minutes-since-midnight for a local Date. */
function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Parse "HH:MM" → minutes-since-midnight. Invalid input → 0 (always-eligible). */
function parseHHMM(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + mm;
}

export interface AutoGenerateArgs {
  now: Date;
  /** Configured earliest time, "HH:MM". */
  morningTime: string;
  /** Last date a briefing was generated, "YYYY-MM-DD", or null if never. */
  lastBriefingDate: string | null;
}

/**
 * True when today's date differs from `lastBriefingDate` AND `now` is at or
 * past `morningTime` for today.
 */
export function shouldAutoGenerate({ now, morningTime, lastBriefingDate }: AutoGenerateArgs): boolean {
  if (todayStr(now) === lastBriefingDate) return false;
  return minutesOfDay(now) >= parseHHMM(morningTime);
}

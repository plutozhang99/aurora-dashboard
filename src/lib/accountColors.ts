/**
 * Deterministic, stable color for an email account, used for the lightweight
 * "source dot" in the aggregated email/schedule lists. Same id → same color;
 * different ids spread across distinct hues.
 */

// A curated palette of distinct hues that read well on the dark glass UI.
const HUES = [265, 190, 25, 130, 320, 50, 215, 0, 160, 290];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorForAccount(accountId: string): string {
  const hue = HUES[hashId(accountId) % HUES.length];
  return `hsl(${hue} 70% 62%)`;
}

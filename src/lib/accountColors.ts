/**
 * Deterministic, stable color for an email account, used for the lightweight
 * "source dot" in the aggregated email/schedule lists. Same id → same color;
 * different ids spread across distinct hues.
 */

// A curated warm editorial palette that harmonizes on the paper surface —
// muted ember, ochre, sage, slate-blue, plum, teal and a few neighbouring
// earth tones. Expressed as "H S% L%" triples so the values drop straight
// into the `hsl(...)` template below.
const PALETTE = [
  '14 56% 50%',   // ember     #C75B39
  '36 52% 47%',   // ochre     #B8853A
  '70 14% 39%',   // sage      #6E7257
  '207 15% 42%',  // slate-blue #5B6B7A
  '327 22% 39%',  // plum      #7A4E63
  '172 33% 36%',  // teal      #3E7A72
  '9 47% 45%',    // brick     #A8462F
  '44 45% 44%',   // mustard   #A28A35
  '150 16% 38%',  // moss      #51705F
];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorForAccount(accountId: string): string {
  const tone = PALETTE[hashId(accountId) % PALETTE.length];
  return `hsl(${tone})`;
}

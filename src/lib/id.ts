/**
 * Generate a UUID with a non-secure-context fallback.
 *
 * `crypto.randomUUID()` only exists in *secure contexts* (HTTPS or
 * localhost/127.0.0.1). When the dashboard is opened over a plain-HTTP LAN /
 * Tailscale IP — a supported deployment here — `crypto.randomUUID` is
 * `undefined`, so calling it throws and silently breaks "add email account" /
 * "add todo" (the click handler aborts before any state update). This helper
 * degrades to `crypto.getRandomValues` (available on HTTP) and finally to a
 * time+random id, so id generation never throws.
 */
export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      // Fall through to the getRandomValues path below.
    }
  }
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
  }
  // Last resort (should never hit in a real browser).
  return `id-${Date.now().toString(16)}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { uid } from './id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uid', () => {
  it('returns a UUID using crypto.randomUUID when available', () => {
    expect(uid()).toMatch(UUID_RE);
  });

  it('still works in a non-secure context (no crypto.randomUUID)', () => {
    // Plain-HTTP LAN/Tailscale: randomUUID is undefined but getRandomValues isn't.
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => real.getRandomValues(a),
    });
    const id = uid();
    expect(id).toMatch(UUID_RE);
    expect(id[14]).toBe('4'); // version nibble
  });

  it('never throws and stays unique even with no crypto at all', () => {
    vi.stubGlobal('crypto', undefined);
    const ids = new Set(Array.from({ length: 500 }, () => uid()));
    expect(ids.size).toBe(500);
  });
});

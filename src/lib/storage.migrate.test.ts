import { describe, it, expect } from 'vitest';
import { migrateEmailAccounts } from './storage';
import type { EmailAccount } from '@/types';

describe('migrateEmailAccounts', () => {
  it('migrates a legacy single-account config into one enabled account', () => {
    const out = migrateEmailAccounts({
      emailEnabled: true,
      emailHost: 'imap.gmail.com',
      emailPort: 993,
      emailUser: 'me@gmail.com',
      emailPassword: 'app-pass',
      emailSecure: true,
    });
    expect(out).toHaveLength(1);
    const acc = out[0];
    expect(acc.enabled).toBe(true);
    expect(acc.host).toBe('imap.gmail.com');
    expect(acc.port).toBe(993);
    expect(acc.user).toBe('me@gmail.com');
    expect(acc.password).toBe('app-pass');
    expect(acc.secure).toBe(true);
    expect(typeof acc.id).toBe('string');
    expect(acc.id.length).toBeGreaterThan(0);
  });

  it('maps emailEnabled:false to a disabled account', () => {
    const out = migrateEmailAccounts({ emailEnabled: false, emailUser: 'me@gmail.com' });
    expect(out).toHaveLength(1);
    expect(out[0].enabled).toBe(false);
  });

  it('leaves an existing emailAccounts array untouched (idempotent, no dup)', () => {
    const existing: EmailAccount[] = [
      { id: 'abc', enabled: true, host: 'h', port: 993, user: 'a@b.com', password: 'p', secure: true },
    ];
    const out = migrateEmailAccounts({
      emailAccounts: existing,
      // legacy fields present too — must be ignored once emailAccounts exists
      emailUser: 'legacy@x.com',
      emailEnabled: true,
    });
    expect(out).toBe(existing);
    expect(out).toHaveLength(1);
    expect(out[0].user).toBe('a@b.com');
  });

  it('keeps an existing empty emailAccounts array (no re-migration)', () => {
    const out = migrateEmailAccounts({ emailAccounts: [], emailUser: 'legacy@x.com' });
    expect(out).toEqual([]);
  });

  it('returns [] for a brand-new user with no legacy fields', () => {
    expect(migrateEmailAccounts({})).toEqual([]);
  });

  it('does not create an account when legacy emailUser is empty/whitespace', () => {
    expect(migrateEmailAccounts({ emailUser: '', emailEnabled: true })).toEqual([]);
    expect(migrateEmailAccounts({ emailUser: '   ', emailEnabled: true })).toEqual([]);
  });
});

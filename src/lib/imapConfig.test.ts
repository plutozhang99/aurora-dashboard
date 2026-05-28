import { describe, it, expect } from 'vitest';
import { inferImapConfig } from './imapConfig';

describe('inferImapConfig', () => {
  it('infers Gmail settings', () => {
    expect(inferImapConfig('x@gmail.com')).toEqual({ host: 'imap.gmail.com', port: 993, secure: true });
  });

  it('infers Outlook/Hotmail settings', () => {
    expect(inferImapConfig('a@outlook.com').host).toBe('outlook.office365.com');
    expect(inferImapConfig('a@hotmail.com').host).toBe('outlook.office365.com');
  });

  it('infers QQ / 163 / iCloud / Yahoo settings', () => {
    expect(inferImapConfig('a@qq.com').host).toBe('imap.qq.com');
    expect(inferImapConfig('a@163.com').host).toBe('imap.163.com');
    expect(inferImapConfig('a@icloud.com').host).toBe('imap.mail.me.com');
    expect(inferImapConfig('a@yahoo.com').host).toBe('imap.mail.yahoo.com');
  });

  it('is case-insensitive and trims input', () => {
    expect(inferImapConfig('  X@GMAIL.COM ').host).toBe('imap.gmail.com');
  });

  it('returns a blank host for unknown domains', () => {
    const cfg = inferImapConfig('me@some-corp.example');
    expect(cfg.host).toBe('');
    expect(cfg.port).toBe(993);
    expect(cfg.secure).toBe(true);
  });

  it('returns a blank host for malformed input', () => {
    expect(inferImapConfig('not-an-email').host).toBe('');
    expect(inferImapConfig('').host).toBe('');
  });
});

/**
 * Infer IMAP connection settings from an email address for common providers.
 * Unknown domains return a blank host so the user fills in the advanced fields.
 */
export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
}

/** domain (lower-case) → IMAP host. All common providers use port 993 + TLS. */
const DOMAIN_HOST: Record<string, string> = {
  'gmail.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com',
  'hotmail.com': 'outlook.office365.com',
  'live.com': 'outlook.office365.com',
  'qq.com': 'imap.qq.com',
  '163.com': 'imap.163.com',
  'icloud.com': 'imap.mail.me.com',
  'me.com': 'imap.mail.me.com',
  'mac.com': 'imap.mail.me.com',
  'yahoo.com': 'imap.mail.yahoo.com',
};

export function inferImapConfig(email: string): ImapConfig {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  const host = DOMAIN_HOST[domain] ?? '';
  return { host, port: 993, secure: true };
}

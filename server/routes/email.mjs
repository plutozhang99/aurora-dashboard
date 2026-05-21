import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const IMPORTANT_HEURISTICS = [
  /urgent/i, /important/i, /asap/i, /action required/i, /invoice/i, /pay/i,
  /security/i, /verify/i, /reset.*password/i, /会议/, /面试/, /合同/, /发票/,
  /账单/, /逾期/, /验证/, /紧急/, /重要/,
];

async function withImap({ host, port, user, pass, secure }, fn) {
  const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
  await client.connect();
  try {
    await client.mailboxOpen('INBOX');
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function emailRoute(req, res) {
  try {
    const items = await withImap(req.body, async (client) => {
      const sinceDate = new Date(Date.now() - 1000 * 60 * 60 * 48);
      const lock = await client.getMailboxLock('INBOX');
      try {
        const list = [];
        for await (const msg of client.fetch({ since: sinceDate }, { source: true, envelope: true, uid: true })) {
          const parsed = await simpleParser(msg.source);
          const subject = parsed.subject || '';
          const from = parsed.from?.text || '';
          const snippet = (parsed.text || '').replace(/\s+/g, ' ').slice(0, 140);
          const important = IMPORTANT_HEURISTICS.some((re) => re.test(subject) || re.test(snippet) || re.test(from));
          if (important) {
            list.push({
              id: `m-${msg.uid}`,
              from, subject, snippet,
              receivedAt: (parsed.date ?? new Date()).getTime(),
              important: true,
              dismissed: false,
            });
          }
        }
        list.sort((a, b) => b.receivedAt - a.receivedAt);
        return list.slice(0, 20);
      } finally {
        lock.release();
      }
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e), items: [] });
  }
}

// Naïve event extractor — looks for time patterns like "10:00", "上午 9 点", "2pm" etc.
const TIME_RE = /(?:(\d{1,2}):(\d{2}))|(?:(\d{1,2})\s*(am|pm))|(?:(上午|下午|中午|晚上|早上)\s*(\d{1,2})\s*[点时])/i;
const SCHEDULE_HINT = /(会议|约会|面试|预约|deadline|截止|due|meeting|appointment|call|interview|提醒)/i;

export async function scheduleRoute(req, res) {
  try {
    const items = await withImap(req.body, async (client) => {
      const sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
      const list = [];
      for await (const msg of client.fetch({ since: sinceDate }, { source: true, envelope: true, uid: true })) {
        const parsed = await simpleParser(msg.source);
        const text = `${parsed.subject || ''}\n${parsed.text || ''}`;
        if (!SCHEDULE_HINT.test(text)) continue;
        const m = text.match(TIME_RE);
        let time = '—';
        if (m) {
          if (m[1]) time = `${m[1].padStart(2,'0')}:${m[2]}`;
          else if (m[3]) time = `${m[3].padStart(2,'0')}:00 ${m[4]}`;
          else if (m[6]) time = `${m[6].padStart(2,'0')}:00`;
        }
        list.push({
          id: `s-${msg.uid}`,
          time,
          title: (parsed.subject || '(无主题)').slice(0, 80),
          source: parsed.from?.text || '邮件',
        });
      }
      return list.slice(0, 12);
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e), items: [] });
  }
}

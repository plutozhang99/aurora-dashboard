import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { llmJson } from '../lib/llm.mjs';

// Fallback keyword lists when the frontend doesn't send one. The frontend ships
// the user-editable lists from settings; these defaults exist only for
// resilience if the request body omits them.
const FALLBACK_IMPORTANT_KEYWORDS = [
  'urgent', 'important', 'asap', 'action required', 'invoice', 'pay',
  'security', 'verify', 'reset password',
  '会议', '面试', '合同', '发票', '账单', '逾期', '验证', '紧急', '重要',
];
const FALLBACK_SCHEDULE_KEYWORDS = [
  'meeting', 'appointment', 'call', 'interview', 'deadline', 'due',
  '会议', '约会', '面试', '预约', '截止', '提醒',
];
const TIME_RE = /(?:(\d{1,2}):(\d{2}))|(?:(\d{1,2})\s*(am|pm))|(?:(上午|下午|中午|晚上|早上)\s*(\d{1,2})\s*[点时])/i;

// Escape user-supplied keywords for use inside a regex character class.
function buildKeywordMatcher(keywords) {
  const list = (Array.isArray(keywords) && keywords.length ? keywords : null);
  const cleaned = (list ?? []).map((k) => String(k).trim()).filter(Boolean);
  if (!cleaned.length) return () => false;
  const escaped = cleaned.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(escaped.join('|'), 'i');
  return (text) => re.test(text);
}

// Per-process cache so polling every 5 min doesn't re-call the LLM for the same UIDs.
// key: `${user}:${kind}:${uid}` → result entry
const aiCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h
function cacheGet(key) {
  const v = aiCache.get(key);
  if (!v) return undefined;
  if (Date.now() - v.t > CACHE_TTL_MS) { aiCache.delete(key); return undefined; }
  return v.v;
}
function cacheSet(key, v) { aiCache.set(key, { v, t: Date.now() }); }

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

async function fetchRecent(client, sinceDate) {
  const out = [];
  for await (const msg of client.fetch({ since: sinceDate }, { source: true, envelope: true, uid: true })) {
    const parsed = await simpleParser(msg.source);
    out.push({
      uid: msg.uid,
      from: parsed.from?.text || '',
      subject: parsed.subject || '',
      snippet: (parsed.text || '').replace(/\s+/g, ' ').slice(0, 400),
      date: (parsed.date ?? new Date()).getTime(),
    });
  }
  return out;
}

function compactForLlm(m) {
  return { uid: m.uid, from: m.from, subject: m.subject, body: m.snippet };
}

export async function emailRoute(req, res) {
  try {
    const { ai, prompt, mode, keywords } = req.body || {};
    const user = req.body?.user || '';
    const useAi = mode === 'ai' && ai?.apiKey;
    const matchImportant = buildKeywordMatcher(
      Array.isArray(keywords) ? keywords : FALLBACK_IMPORTANT_KEYWORDS
    );
    const items = await withImap(req.body, async (client) => {
      const sinceDate = new Date(Date.now() - 1000 * 60 * 60 * 48);
      const lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await fetchRecent(client, sinceDate);
        let importantUids;

        if (useAi && messages.length) {
          const needLlm = [];
          const cached = new Map();
          for (const m of messages) {
            const k = `${user}:imp:${m.uid}`;
            const hit = cacheGet(k);
            if (hit !== undefined) cached.set(m.uid, hit);
            else needLlm.push(m);
          }

          let llmImportant = new Set();
          if (needLlm.length) {
            try {
              const out = await llmJson(
                { provider: ai.provider, apiKey: ai.apiKey, model: ai.model },
                prompt || '',
                JSON.stringify({ emails: needLlm.map(compactForLlm) })
              );
              const arr = Array.isArray(out?.important) ? out.important : [];
              llmImportant = new Set(arr.map((e) => Number(e?.uid)).filter(Number.isFinite));
              for (const m of needLlm) {
                cacheSet(`${user}:imp:${m.uid}`, llmImportant.has(m.uid));
              }
            } catch {
              // Don't poison cache on transient LLM failures — fall back to keyword for this batch.
              for (const m of needLlm) {
                if (matchImportant(`${m.subject}\n${m.snippet}\n${m.from}`)) llmImportant.add(m.uid);
              }
            }
          }
          importantUids = new Set([
            ...llmImportant,
            ...[...cached.entries()].filter(([, v]) => v).map(([uid]) => uid),
          ]);
        } else {
          importantUids = new Set(
            messages
              .filter((m) => matchImportant(`${m.subject}\n${m.snippet}\n${m.from}`))
              .map((m) => m.uid)
          );
        }

        const list = messages
          .filter((m) => importantUids.has(m.uid))
          .map((m) => ({
            id: `m-${m.uid}`,
            from: m.from,
            subject: m.subject,
            snippet: m.snippet.slice(0, 140),
            receivedAt: m.date,
            important: true,
            dismissed: false,
          }))
          .sort((a, b) => b.receivedAt - a.receivedAt)
          .slice(0, 20);
        return list;
      } finally {
        lock.release();
      }
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e), items: [] });
  }
}

export async function scheduleRoute(req, res) {
  try {
    const { ai, prompt, mode, keywords } = req.body || {};
    const user = req.body?.user || '';
    const useAi = mode === 'ai' && ai?.apiKey;
    const matchHint = buildKeywordMatcher(
      Array.isArray(keywords) ? keywords : FALLBACK_SCHEDULE_KEYWORDS
    );
    const items = await withImap(req.body, async (client) => {
      const sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
      const messages = await fetchRecent(client, sinceDate);

      if (useAi && messages.length) {
        // Reuse cache by (user, sch, uid). Cache stores the extracted event or null.
        const cached = [];
        const needLlm = [];
        for (const m of messages) {
          const k = `${user}:sch:${m.uid}`;
          const hit = cacheGet(k);
          if (hit !== undefined) {
            if (hit) cached.push(hit);
          } else needLlm.push(m);
        }
        let extracted = [];
        if (needLlm.length) {
          try {
            const out = await llmJson(
              { provider: ai.provider, apiKey: ai.apiKey, model: ai.model },
              prompt || '',
              JSON.stringify({
                today: new Date().toISOString().slice(0, 10),
                emails: needLlm.map(compactForLlm),
              })
            );
            const arr = Array.isArray(out?.events) ? out.events : [];
            const byUid = new Map(arr.map((e) => [Number(e?.uid), e]));
            for (const m of needLlm) {
              const ev = byUid.get(m.uid);
              if (ev && ev.title) {
                const item = {
                  id: `s-${m.uid}`,
                  time: String(ev.time || '—'),
                  title: String(ev.title).slice(0, 80),
                  source: m.from || '邮件',
                };
                extracted.push(item);
                cacheSet(`${user}:sch:${m.uid}`, item);
              } else {
                cacheSet(`${user}:sch:${m.uid}`, null);
              }
            }
          } catch {
            // Fall back to heuristic for this batch.
            extracted = heuristicSchedule(needLlm, matchHint);
          }
        }
        return [...cached, ...extracted].slice(0, 12);
      }

      return heuristicSchedule(messages, matchHint).slice(0, 12);
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e), items: [] });
  }
}

function heuristicSchedule(messages, matchHint) {
  const list = [];
  for (const m of messages) {
    const text = `${m.subject}\n${m.snippet}`;
    if (!matchHint(text)) continue;
    const match = text.match(TIME_RE);
    let time = '—';
    if (match) {
      if (match[1]) time = `${match[1].padStart(2, '0')}:${match[2]}`;
      else if (match[3]) time = `${match[3].padStart(2, '0')}:00 ${match[4]}`;
      else if (match[6]) time = `${match[6].padStart(2, '0')}:00`;
    }
    list.push({
      id: `s-${m.uid}`,
      time,
      title: (m.subject || '(无主题)').slice(0, 80),
      source: m.from || '邮件',
    });
  }
  return list;
}

/**
 * AI chat proxy — used when browser-to-provider CORS is blocked. The frontend
 * always tries direct first; only when it fails does it fall back here.
 */
export async function aiRoute(req, res) {
  const { provider, apiKey, model, system, messages } = req.body || {};
  if (!provider || !apiKey) return res.status(400).json({ error: 'provider/apiKey required' });

  try {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] }),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
    res.status(400).json({ error: 'unknown provider' });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

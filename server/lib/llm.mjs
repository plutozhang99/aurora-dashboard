/**
 * Provider-agnostic helper that asks an LLM to return strict JSON.
 * Returns the parsed object, or throws if the response can't be parsed.
 */
export async function llmJson({ provider, apiKey, model }, system, user) {
  if (!provider || !apiKey) throw new Error('llm: provider/apiKey required');

  let raw;
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
    const data = await r.json();
    raw = data?.content?.[0]?.text ?? '';
  } else if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${await r.text()}`);
    const data = await r.json();
    raw = data?.choices?.[0]?.message?.content ?? '';
  } else {
    throw new Error(`llm: unknown provider ${provider}`);
  }

  return parseJsonLoose(raw);
}

// Models sometimes wrap JSON in ```json fences or add stray text — recover the outermost {...}.
function parseJsonLoose(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {}
  }
  throw new Error(`llm: response was not JSON: ${trimmed.slice(0, 200)}`);
}

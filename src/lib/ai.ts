import type { AppSettings, ChatPersona } from '@/types';
import { effectivePersonaPrompt } from '@/types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Direct browser-to-provider chat call.
 * Browser CORS may block this for some providers — when blocked, route via the
 * local backend's /api/ai/chat endpoint instead. We try direct first to keep
 * the dashboard frontend-only usable.
 */
export async function chat(
  settings: AppSettings,
  persona: ChatPersona,
  history: ChatMessage[]
): Promise<string> {
  if (settings.aiProvider === 'none' || !settings.aiApiKey) {
    return '请先在「设置 → AI」中配置 API Key 与 provider。';
  }

  const system = effectivePersonaPrompt(settings, persona.id);

  if (settings.aiProvider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.aiApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.aiModel || 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        messages: history.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.content?.[0]?.text ?? '';
  }

  if (settings.aiProvider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...history],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  }

  return '未支持的 provider。';
}

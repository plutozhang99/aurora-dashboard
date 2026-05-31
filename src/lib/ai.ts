import type { AppSettings } from '@/types';

/** The `ai` block the backend expects on /email/*, /schedule, /briefing. */
export interface AiPayload {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/**
 * Build the AI request payload from settings, or `undefined` when AI isn't
 * usable (so callers fall back to keyword/heuristic mode). Centralizes the
 * one rule that differs per provider: **Ollama is local & keyless**, so it only
 * needs a provider selection (and optionally a base URL); every other provider
 * needs an API key.
 */
export function aiPayload(settings: AppSettings): AiPayload | undefined {
  const { aiProvider, aiApiKey, aiModel, aiBaseUrl } = settings;
  if (aiProvider === 'none') return undefined;
  if (aiProvider !== 'ollama' && !aiApiKey) return undefined;
  return {
    provider: aiProvider,
    apiKey: aiApiKey,
    model: aiModel,
    baseUrl: aiBaseUrl || undefined,
  };
}

/** Whether AI is configured well enough to be used (mirrors {@link aiPayload}). */
export function aiConfigured(settings: AppSettings): boolean {
  return aiPayload(settings) !== undefined;
}

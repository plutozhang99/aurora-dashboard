import { describe, it, expect } from 'vitest';
import { aiPayload, aiConfigured } from './ai';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types';

const s = (over: Partial<AppSettings>): AppSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('aiPayload', () => {
  it('returns undefined when provider is none', () => {
    expect(aiPayload(s({ aiProvider: 'none', aiApiKey: 'k' }))).toBeUndefined();
  });

  it('requires an API key for cloud providers', () => {
    expect(aiPayload(s({ aiProvider: 'anthropic', aiApiKey: '' }))).toBeUndefined();
    expect(aiPayload(s({ aiProvider: 'deepseek', aiApiKey: '' }))).toBeUndefined();
    expect(aiPayload(s({ aiProvider: 'deepseek', aiApiKey: 'sk-x', aiModel: 'deepseek-chat' })))
      .toEqual({ provider: 'deepseek', apiKey: 'sk-x', model: 'deepseek-chat', baseUrl: undefined });
  });

  it('enables Ollama with no API key', () => {
    expect(aiPayload(s({ aiProvider: 'ollama', aiApiKey: '', aiModel: 'llama3.1' })))
      .toEqual({ provider: 'ollama', apiKey: '', model: 'llama3.1', baseUrl: undefined });
  });

  it('passes a custom base URL through (and omits a blank one)', () => {
    const out = aiPayload(s({ aiProvider: 'ollama', aiBaseUrl: 'http://192.168.1.9:11434/v1' }));
    expect(out?.baseUrl).toBe('http://192.168.1.9:11434/v1');
  });

  it('aiConfigured mirrors aiPayload', () => {
    expect(aiConfigured(s({ aiProvider: 'ollama', aiApiKey: '' }))).toBe(true);
    expect(aiConfigured(s({ aiProvider: 'openai', aiApiKey: '' }))).toBe(false);
  });
});

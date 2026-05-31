import { describe, expect, it } from 'vitest';
import { modelOptions, AI_MODELS, DEFAULT_MODEL_FOR } from './aiModels';

describe('modelOptions', () => {
  it('labels known ids and falls back to the raw id for unknown ones', () => {
    const opts = modelOptions('anthropic', ['claude-sonnet-4-6', 'claude-future-9'], 'claude-sonnet-4-6');
    expect(opts.find((o) => o.value === 'claude-sonnet-4-6')?.label).toContain('Sonnet 4.6');
    expect(opts.find((o) => o.value === 'claude-future-9')?.label).toBe('claude-future-9');
  });

  it('keeps the current value as an option when not in the list (marked 当前)', () => {
    const opts = modelOptions('openai', ['gpt-5.4'], 'my-custom-model');
    expect(opts[0]).toEqual({ value: 'my-custom-model', label: 'my-custom-model · 当前' });
  });

  it('dedupes repeated ids', () => {
    const opts = modelOptions('deepseek', ['deepseek-chat', 'deepseek-chat'], '');
    expect(opts.filter((o) => o.value === 'deepseek-chat')).toHaveLength(1);
  });

  it('every provider default is present in its curated list', () => {
    for (const [provider, model] of Object.entries(DEFAULT_MODEL_FOR)) {
      expect(AI_MODELS[provider].some((o) => o.value === model)).toBe(true);
    }
  });
});

/**
 * Curated per-provider model lists for the settings model picker.
 *
 * These are the *offline fallback* shown before (or when) a live fetch from the
 * provider's own list-models API fails. Sourced from each provider's current API
 * docs via Context7 (2026-05-31). The picker prefers the live list when the user
 * clicks "拉取最新"; this list keeps the dropdown useful with no backend/key.
 */
export interface ModelOption {
  value: string;
  label: string;
}

export const AI_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 · 最强' },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 · 均衡（推荐）' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 · 最快' },
  ],
  openai: [
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini · 性价比（推荐）' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano · 最快' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { value: 'o4-mini', label: 'o4-mini · 推理' },
    { value: 'o3', label: 'o3 · 推理' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'deepseek-chat · V3.2 非思考（推荐）' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner · V3.2 思考' },
    { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
    { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash · 轻量' },
  ],
  ollama: [
    { value: 'llama3.1', label: 'llama3.1' },
    { value: 'qwen2.5', label: 'qwen2.5' },
    { value: 'qwen2.5-coder', label: 'qwen2.5-coder' },
    { value: 'gemma2', label: 'gemma2' },
    { value: 'mistral', label: 'mistral' },
    { value: 'phi4', label: 'phi4' },
  ],
};

/** Sensible default model when a provider is first chosen. */
export const DEFAULT_MODEL_FOR: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.4-mini',
  deepseek: 'deepseek-chat',
  ollama: 'llama3.1',
};

/**
 * Build `<Select>` options from a list of model ids, labelling known ones from
 * {@link AI_MODELS} and falling back to the raw id. The currently-selected model
 * is always kept as an option (marked "当前") so a custom/previously-set value is
 * never silently dropped.
 */
export function modelOptions(
  provider: string,
  ids: string[],
  current: string,
): ModelOption[] {
  const labels = new Map((AI_MODELS[provider] ?? []).map((o) => [o.value, o.label]));
  const seen = new Set<string>();
  const opts: ModelOption[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    opts.push({ value: id, label: labels.get(id) ?? id });
  }
  if (current && !seen.has(current)) {
    opts.unshift({ value: current, label: `${current} · 当前` });
  }
  return opts;
}

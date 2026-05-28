import { describe, it, expect } from 'vitest';
import { suggestionToTodo, activeSuggestions } from './storage';
import type { TodoSuggestion } from '@/types';

function sug(over: Partial<TodoSuggestion> = {}): TodoSuggestion {
  return {
    id: 't-acc1-42',
    text: '支付发票 #2291',
    sourceAccountId: 'acc1',
    sourceEmailId: 'm-acc1-42',
    from: 'billing@vendor.com',
    subject: '发票 #2291 待支付',
    ...over,
  };
}

describe('suggestionToTodo (confirm)', () => {
  it('produces a TodoItem carrying the email source fields', () => {
    const s = sug();
    const t = suggestionToTodo(s, 1_700_000_000_000);
    expect(t.text).toBe('支付发票 #2291');
    expect(t.done).toBe(false);
    expect(t.createdAt).toBe(1_700_000_000_000);
    expect(t.sourceEmailId).toBe('m-acc1-42');
    expect(t.sourceAccountId).toBe('acc1');
    expect(t.sourceSubject).toBe('发票 #2291 待支付');
    expect(typeof t.id).toBe('string');
    expect(t.id.length).toBeGreaterThan(0);
  });

  it('gives each confirmed todo a fresh id (not the suggestion id)', () => {
    const s = sug();
    const a = suggestionToTodo(s);
    const b = suggestionToTodo(s);
    expect(a.id).not.toBe(s.id);
    expect(a.id).not.toBe(b.id);
  });
});

describe('activeSuggestions (filter)', () => {
  const list = [
    sug({ id: 't-acc1-1', sourceEmailId: 'm-acc1-1' }),
    sug({ id: 't-acc1-2', sourceEmailId: 'm-acc1-2' }),
    sug({ id: 't-acc2-9', sourceEmailId: 'm-acc2-9' }),
  ];

  it('shows all when nothing dismissed/confirmed', () => {
    expect(activeSuggestions(list, new Set(), new Set())).toHaveLength(3);
  });

  it('hides ignored (dismissed) suggestions — persists across refetch', () => {
    const out = activeSuggestions(list, new Set(['t-acc1-2']), new Set());
    expect(out.map((s) => s.id)).toEqual(['t-acc1-1', 't-acc2-9']);
  });

  it('hides suggestions whose source email was already confirmed into a todo', () => {
    const out = activeSuggestions(list, new Set(), new Set(['m-acc1-1']));
    expect(out.map((s) => s.id)).toEqual(['t-acc1-2', 't-acc2-9']);
  });

  it('confirmed suggestions are no longer active (AE5: not counted/shown)', () => {
    // After confirming t-acc1-1, its sourceEmailId is in the confirmed set.
    const confirmed = new Set([suggestionToTodo(list[0]).sourceEmailId!]);
    const out = activeSuggestions(list, new Set(), confirmed);
    expect(out.find((s) => s.id === 't-acc1-1')).toBeUndefined();
  });
});

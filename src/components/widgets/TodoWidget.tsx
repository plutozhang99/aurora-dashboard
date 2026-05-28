import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, Plus, Trash2, Square, Paperclip, Lightbulb, Check, X } from 'lucide-react';
import { Button, TextField, Input } from '@heroui/react';
import {
  db,
  activeSuggestions,
  confirmSuggestion,
  ignoreSuggestion,
} from '@/lib/storage';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, EmailAccount, TodoItem, TodoSuggestion, AccountError } from '@/types';
import { Header } from './CalendarWidget';

interface TodosResponse {
  suggestions: TodoSuggestion[];
  errors?: AccountError[] | null;
}

function enabledAccounts(settings: AppSettings): EmailAccount[] {
  return settings.emailAccounts.filter((a) => a.enabled);
}

function accountsKey(accounts: EmailAccount[]): string {
  return JSON.stringify(
    accounts.map((a) => [a.id, a.host, a.port, a.user, a.secure, a.password, a.enabled]),
  );
}

export function TodoWidget() {
  const settings = useStore((s) => s.settings);
  const accounts = enabledAccounts(settings);

  const items = useLiveQuery(
    async () => db.todos.orderBy('createdAt').reverse().toArray(),
    [],
    [] as TodoItem[],
  );

  const dismissedRows = useLiveQuery(
    async () => db.suggestions.toArray(),
    [],
    [] as TodoSuggestion[],
  );

  const [input, setInput] = useState('');

  const { data: fetched } = useQuery({
    queryKey: ['email-todos', accountsKey(accounts)],
    queryFn: async (): Promise<TodoSuggestion[]> => {
      if (accounts.length === 0) return [];
      const has = await apiAvailable();
      if (!has) return [];
      const res = await api<TodosResponse>(`/email/todos`, {
        method: 'POST',
        body: JSON.stringify({
          accounts,
          mode: settings.emailImportanceMode,
          keywords: settings.emailImportanceKeywords,
          ai: settings.aiProvider !== 'none' && settings.aiApiKey
            ? { provider: settings.aiProvider, apiKey: settings.aiApiKey, model: settings.aiModel }
            : undefined,
          prompt: settings.prompts.emailTodo,
        }),
      }).catch(() => ({ suggestions: [] as TodoSuggestion[], errors: null }));
      return res.suggestions ?? [];
    },
    refetchInterval: 1000 * 60 * 10,
  });

  const dismissedIds = new Set((dismissedRows ?? []).filter((r) => r.dismissed).map((r) => r.id));
  const confirmedSourceIds = new Set(
    (items ?? []).map((t) => t.sourceEmailId).filter((id): id is string => !!id),
  );
  const suggestions = activeSuggestions(fetched ?? [], dismissedIds, confirmedSourceIds);

  async function add() {
    const t = input.trim();
    if (!t) return;
    await db.todos.put({ id: crypto.randomUUID(), text: t, done: false, createdAt: Date.now() });
    setInput('');
  }

  async function toggle(it: TodoItem) {
    await db.todos.put({ ...it, done: !it.done });
  }

  async function del(id: string) {
    await db.todos.delete(id);
  }

  const remaining = items?.filter((i) => !i.done).length ?? 0;

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<CheckSquare size={14} className="text-ember" />} title="待办 · To-do" right={`剩 ${remaining}`} />
      <div className="flex gap-2 mt-3">
        <TextField
          value={input}
          onChange={setInput}
          className="flex-1"
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter') add();
          }}
        >
          <Input placeholder="新增一项待办…" />
        </TextField>
        <Button isIconOnly size="sm" variant="primary" onPress={add} aria-label="添加待办">
          <Plus size={14} />
        </Button>
      </div>
      <div className="flex-1 min-h-0 scroll-area mt-2">
        <div className="divide-y divide-rule">
          {items?.map((it) => (
            <div key={it.id} className="flex items-center gap-2.5 py-2 group">
              <button
                type="button"
                onClick={() => toggle(it)}
                className={`shrink-0 ${it.done ? 'text-sage' : 'text-ink-3 hover:text-ink'}`}
                aria-label={it.done ? '标记未完成' : '标记完成'}
              >
                {it.done ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              <div className={`flex-1 text-sm truncate ${it.done ? 'line-through text-ink-4' : 'text-ink'}`}>{it.text}</div>
              {it.sourceEmailId && (
                <span className="text-ink-3 shrink-0" title={it.sourceSubject ? `来自邮件：${it.sourceSubject}` : '来自邮件'}>
                  <Paperclip size={12} />
                </span>
              )}
              <button
                type="button"
                onClick={() => del(it.id)}
                className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-ember shrink-0"
                aria-label="删除待办"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {(!items || items.length === 0) && (
          <div className="text-ink-3 text-sm text-center py-3">还没有待办，添加一项开始吧 ✨</div>
        )}

        {suggestions.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-rule">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb size={12} className="text-ember shrink-0" />
              <span className="kicker">建议待办 · 来自邮件</span>
              <span className="num text-ink-3 text-[11px]">{suggestions.length}</span>
            </div>
            <div className="divide-y divide-rule">
              {suggestions.map((s) => (
                <div key={s.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: colorForAccount(s.sourceAccountId) }}
                      title={s.from}
                    />
                    <div className="flex-1 text-sm text-ink truncate">{s.text}</div>
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => confirmSuggestion(s)}
                      aria-label="转为正式待办"
                    >
                      <Check size={12} /> 确认
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      onPress={() => ignoreSuggestion(s)}
                      aria-label="忽略此建议"
                    >
                      <X size={14} /> 忽略
                    </Button>
                  </div>
                  <div className="text-[10px] text-ink-3 truncate pl-4 mt-0.5">↳ {s.from}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

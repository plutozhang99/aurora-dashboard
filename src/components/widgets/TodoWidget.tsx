import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, Plus, Trash2, Square, Paperclip, Lightbulb, Check, X } from 'lucide-react';
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
/**
 * Stable key over the connection-relevant fields of each enabled account (not
 * just ids), so editing an existing account's credentials triggers a refetch.
 * In-memory only — never persisted/logged — so including the password is fine.
 */
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

  // Local dismissed (ignored) suggestion ids and confirmed source-email ids.
  const dismissedRows = useLiveQuery(
    async () => db.suggestions.toArray(),
    [],
    [] as TodoSuggestion[],
  );

  const [input, setInput] = useState('');

  // Fetch email→todo suggestions from the backend (gated on availability).
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

  // Suggestions never count toward the "剩 N" formal-todo counter.
  const remaining = items?.filter((i) => !i.done).length ?? 0;

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<CheckSquare size={14} />} title="待办" right={`剩 ${remaining}`} />
      <div className="flex gap-2 mt-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="新增一项待办…"
        />
        <button className="btn btn-primary" onClick={add}><Plus size={14} /></button>
      </div>
      <div className="flex-1 min-h-0 scroll-area space-y-1.5 mt-2">
        {/* Formal todos */}
        {items?.map((it) => (
          <div key={it.id} className="rounded-lg bg-white/5 px-3 py-2 flex items-center gap-2 group">
            <button onClick={() => toggle(it)} className="text-white/70 hover:text-white shrink-0">
              {it.done ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <div className={`flex-1 text-sm ${it.done ? 'line-through text-white/40' : ''} truncate`}>{it.text}</div>
            {it.sourceEmailId && (
              <span className="text-aurora-cyan/70 shrink-0" title={it.sourceSubject ? `来自邮件：${it.sourceSubject}` : '来自邮件'}>
                <Paperclip size={12} />
              </span>
            )}
            <button onClick={() => del(it.id)} className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-rose-400 shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {(!items || items.length === 0) && (
          <div className="text-white/40 text-sm text-center py-3">还没有待办，添加一项开始吧 ✨</div>
        )}

        {/* Suggested todos (from email) */}
        {suggestions.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-2 mt-1 border-t border-white/10 text-[11px] text-white/50">
              <Lightbulb size={12} className="text-amber-300/80" />
              <span>建议待办 (来自邮件 · {suggestions.length})</span>
            </div>
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-lg bg-amber-500/5 border border-amber-400/10 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: colorForAccount(s.sourceAccountId) }}
                    title={s.from}
                  />
                  <div className="flex-1 text-sm truncate">{s.text}</div>
                  <button
                    className="btn px-2 py-0.5 text-[11px] gap-1"
                    onClick={() => confirmSuggestion(s)}
                    title="转为正式待办（保留邮件来源）"
                  >
                    <Check size={12} /> 确认
                  </button>
                  <button
                    className="text-white/40 hover:text-white p-1"
                    onClick={() => ignoreSuggestion(s)}
                    title="忽略此建议"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="text-[10px] text-white/40 truncate pl-4 mt-0.5">↳ {s.from}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

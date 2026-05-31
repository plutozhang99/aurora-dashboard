/**
 * Backend-backed persistence for todos, the scratchpad note, and the dismissed
 * email/suggestion markers. These used to live in IndexedDB (browser-only); they
 * now live in the local backend's JSON store so they survive a browser/machine
 * switch (point every client at the same `serverUrl`, or sync `AURORA_DATA_DIR`).
 *
 * The backend is the source of truth — when it's down these features are
 * unavailable, exactly like email/schedule/briefing. Callers gate on
 * `apiAvailable()` and surface the "本地后端未运行" notice.
 */
import { api } from './api';
import { db, getKV, setKV, suggestionToTodo } from './storage';
import type { EmailItem, ScheduleItem, TodoItem, TodoSuggestion } from '@/types';

const enc = encodeURIComponent;

// ── Todos ────────────────────────────────────────────────────────────────────

export async function listTodos(): Promise<TodoItem[]> {
  const res = await api<{ items: TodoItem[] }>('/store/todos');
  return res.items;
}

export async function putTodo(todo: TodoItem): Promise<void> {
  await api(`/store/todos/${enc(todo.id)}`, { method: 'PUT', body: JSON.stringify(todo) });
}

export async function deleteTodo(id: string): Promise<void> {
  await api(`/store/todos/${enc(id)}`, { method: 'DELETE' });
}

// ── Scratchpad note ──────────────────────────────────────────────────────────

export async function loadNoteRemote(): Promise<string> {
  const res = await api<{ text: string }>('/store/note');
  return res.text ?? '';
}

export async function saveNoteRemote(text: string): Promise<void> {
  await api('/store/note', { method: 'PUT', body: JSON.stringify({ text }) });
}

// ── Email→todo suggestions (dismissed markers) ───────────────────────────────

/** The dismissed (ignored) suggestion markers persisted on the backend. */
export async function listDismissedSuggestions(): Promise<TodoSuggestion[]> {
  const res = await api<{ items: TodoSuggestion[] }>('/store/suggestions');
  return res.items;
}

/** Ignore a suggestion → persist a dismissed marker so it never resurfaces. */
export async function ignoreSuggestionRemote(s: TodoSuggestion): Promise<void> {
  await api(`/store/suggestions/${enc(s.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...s, dismissed: true }),
  });
}

/** Confirm a suggestion → write a real todo (carrying the email source refs). */
export async function confirmSuggestionRemote(s: TodoSuggestion): Promise<void> {
  await putTodo(suggestionToTodo(s));
  // Drop any stale dismissed marker; ignored if it was never persisted.
  await api(`/store/suggestions/${enc(s.id)}`, { method: 'DELETE' }).catch(() => {});
}

// ── Important-email dismiss state ─────────────────────────────────────────────

export async function listDismissedEmails(): Promise<EmailItem[]> {
  const res = await api<{ items: EmailItem[] }>('/store/emails');
  return res.items;
}

export async function dismissEmailRemote(m: EmailItem): Promise<void> {
  await api(`/store/emails/${enc(m.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...m, dismissed: true }),
  });
}

// ── Today-schedule removed state ──────────────────────────────────────────────

export async function listDismissedSchedules(): Promise<ScheduleItem[]> {
  const res = await api<{ items: ScheduleItem[] }>('/store/schedules');
  return res.items;
}

export async function dismissScheduleRemote(s: ScheduleItem): Promise<void> {
  await api(`/store/schedules/${enc(s.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...s, dismissed: true }),
  });
}

// ── One-time migration of legacy browser (IndexedDB) data ────────────────────

/**
 * Best-effort, run-once import of data that older builds stored in IndexedDB
 * (todos, note, dismissed suggestion/email markers) into the backend store, so
 * upgrading users don't see their existing todos/note vanish. Guarded by a kv
 * flag and id-based upsert, so it's safe to re-run and never duplicates. If the
 * backend is unreachable it does nothing and retries on the next launch.
 */
export async function migrateBrowserDataToBackend(): Promise<void> {
  if (await getKV<boolean>('backendMigrationDone', false)) return;
  try {
    const [todos, suggestions, emails, note] = await Promise.all([
      db.todos.toArray(),
      db.suggestions.toArray(),
      db.emails.toArray(),
      getKV<string>('note', ''),
    ]);

    for (const t of todos) await putTodo(t);
    for (const s of suggestions) if (s.dismissed) await ignoreSuggestionRemote(s);
    for (const e of emails) if (e.dismissed) await dismissEmailRemote(e);
    if (note && note.trim() && !(await loadNoteRemote())) await saveNoteRemote(note);

    await setKV('backendMigrationDone', true);
  } catch {
    // Backend down or a transient failure — leave the flag unset and retry later.
  }
}

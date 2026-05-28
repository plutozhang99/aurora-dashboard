import Dexie, { type Table } from 'dexie';
import type { AppSettings, DashboardLayout, EmailAccount, EmailItem, TodoItem, TodoSuggestion, WidgetInstance } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

interface KVRow { key: string; value: unknown }

class AuroraDB extends Dexie {
  kv!: Table<KVRow, string>;
  todos!: Table<TodoItem, string>;
  emails!: Table<EmailItem, string>;
  suggestions!: Table<TodoSuggestion, string>;
  constructor() {
    super('aurora');
    this.version(1).stores({
      kv: '&key',
      todos: '&id, done, createdAt',
      emails: '&id, receivedAt, dismissed',
    });
    // v2 ADDS the suggestions store. Dexie preserves existing kv/todos/emails
    // data and stores on upgrade — they are intentionally not re-declared here.
    this.version(2).stores({
      suggestions: '&id, dismissed',
    });
  }
}

export const db = new AuroraDB();

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value });
}

// ── Email→todo suggestions ──────────────────────────────────────────────────

/**
 * Build the real TodoItem produced when a user confirms an email suggestion.
 * Pure + testable. Carries the source refs so the formal todo shows a 📎 link.
 */
export function suggestionToTodo(s: TodoSuggestion, now: number = Date.now()): TodoItem {
  return {
    id: crypto.randomUUID(),
    text: s.text,
    done: false,
    createdAt: now,
    sourceEmailId: s.sourceEmailId,
    sourceAccountId: s.sourceAccountId,
    sourceSubject: s.subject,
  };
}

/**
 * Filter freshly-fetched suggestions down to the ones that should still show:
 * not locally dismissed (ignored) and not already confirmed into a real todo.
 * Pure + testable.
 */
export function activeSuggestions(
  fetched: TodoSuggestion[],
  dismissedIds: Set<string>,
  confirmedSourceEmailIds: Set<string>,
): TodoSuggestion[] {
  return fetched.filter(
    (s) => !dismissedIds.has(s.id) && !confirmedSourceEmailIds.has(s.sourceEmailId),
  );
}

/** Confirm a suggestion → write a real todo (with source) and drop the suggestion. */
export async function confirmSuggestion(s: TodoSuggestion) {
  await db.todos.put(suggestionToTodo(s));
  await db.suggestions.delete(s.id);
}

/** Ignore a suggestion → persist a dismissed marker so it never resurfaces. */
export async function ignoreSuggestion(s: TodoSuggestion) {
  await db.suggestions.put({ ...s, dismissed: true });
}

/** Set of suggestion ids the user has ignored (persisted across refresh). */
export async function loadDismissedSuggestionIds(): Promise<Set<string>> {
  const rows = await db.suggestions.toArray();
  return new Set(rows.filter((r) => r.dismissed).map((r) => r.id));
}

/** Set of sourceEmailIds already promoted to a real todo (so they don't re-suggest). */
export async function loadConfirmedSourceEmailIds(): Promise<Set<string>> {
  const rows = await db.todos.toArray();
  return new Set(
    rows.map((t) => t.sourceEmailId).filter((id): id is string => !!id),
  );
}

// ── Morning briefing cache (kv) ──────────────────────────────────────────────

export interface CachedBriefing {
  date: string; // YYYY-MM-DD
  text: string;
  sections: Record<string, unknown> | null;
  generatedAt: number;
}

export async function loadBriefing(): Promise<CachedBriefing | null> {
  return await getKV<CachedBriefing | null>('briefing', null);
}

export async function saveBriefing(b: CachedBriefing) {
  await setKV('briefing', b);
  await setKV('lastBriefingDate', b.date);
}

export async function loadLastBriefingDate(): Promise<string | null> {
  return await getKV<string | null>('lastBriefingDate', null);
}

/**
 * Legacy single-account shape that older builds persisted directly on the
 * settings object. Read loosely so we can migrate it into `emailAccounts`.
 */
interface LegacyEmailFields {
  emailAccounts?: EmailAccount[];
  emailEnabled?: boolean;
  emailHost?: string;
  emailPort?: number;
  emailUser?: string;
  emailPassword?: string;
  emailSecure?: boolean;
}

/**
 * Idempotent migration from the legacy single-account settings shape to
 * `emailAccounts: EmailAccount[]`. Pure + testable.
 *
 * - Already has `emailAccounts` → return it unchanged (never re-migrates).
 * - No `emailAccounts` but a non-empty legacy `emailUser` → wrap it as one account.
 * - Brand-new user (no legacy user) → `[]`.
 */
export function migrateEmailAccounts(raw: LegacyEmailFields): EmailAccount[] {
  if (Array.isArray(raw.emailAccounts)) return raw.emailAccounts;
  const user = (raw.emailUser ?? '').trim();
  if (!user) return [];
  return [
    {
      id: crypto.randomUUID(),
      label: undefined,
      enabled: !!raw.emailEnabled,
      host: raw.emailHost ?? '',
      port: raw.emailPort ?? 993,
      user: raw.emailUser ?? '',
      password: raw.emailPassword ?? '',
      secure: raw.emailSecure ?? true,
    },
  ];
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await getKV<Partial<AppSettings> & LegacyEmailFields>('settings', {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // Deep-merge prompts so newly added default prompts appear for existing users.
  merged.prompts = {
    ...DEFAULT_SETTINGS.prompts,
    ...(stored.prompts ?? {}),
  };
  // Migrate legacy single-account email config into the multi-account array.
  merged.emailAccounts = migrateEmailAccounts(stored);
  return merged;
}

export async function saveSettings(s: AppSettings) {
  await setKV('settings', s);
}

export async function loadLayout(): Promise<DashboardLayout | null> {
  return await getKV<DashboardLayout | null>('layout', null);
}

export async function saveLayout(layout: DashboardLayout) {
  await setKV('layout', layout);
}

/**
 * Reconcile a persisted layout against the current widget set after the rescope.
 * Pure + testable.
 *
 * Pre-rescope layouts still contain REMOVED widget types (system/music/chat/
 * agent-usage), which render as "未知组件" boxes, and LACK the new `briefing`
 * centerpiece. Rather than leave dead boxes + a missing briefing card, treat any
 * layout containing an unknown widget type as stale and reset it to the new
 * default. A clean new-schema layout is preserved as-is.
 *
 * - `null` (fresh install) → DEFAULT_LAYOUT.
 * - Contains any widget whose type is not a currently-valid WidgetType → DEFAULT_LAYOUT.
 * - Otherwise → return `persisted` unchanged.
 */
export function reconcileLayout(persisted: DashboardLayout | null): DashboardLayout {
  if (!persisted) return DEFAULT_LAYOUT;
  const validTypes = new Set(DEFAULT_LAYOUT.widgets.map((w) => w.type));
  const hasStaleWidget = persisted.widgets.some((w) => !validTypes.has(w.type));
  return hasStaleWidget ? DEFAULT_LAYOUT : persisted;
}

export const DEFAULT_LAYOUT: DashboardLayout = {
  // Order matters for single-column (sm/xs) flow: briefing banner first, then
  // the email-centric stack (design §1 & §6).
  widgets: [
    { id: 'w-briefing', type: 'briefing' },
    { id: 'w-calendar', type: 'calendar' },
    { id: 'w-clock', type: 'clock' },
    { id: 'w-weather', type: 'weather' },
    { id: 'w-email', type: 'email' },
    { id: 'w-todo', type: 'todo' },
    { id: 'w-news', type: 'news' },
  ] as WidgetInstance[],
  layouts: {
    // lg (12 cols): briefing full-width banner on top; then
    // calendar + clock + weather row; email + todo row; news full-width bottom.
    lg: [
      { i: 'w-briefing',    x: 0, y: 0,  w: 12, h: 3, minW: 6, minH: 2 },
      { i: 'w-calendar',    x: 0, y: 3,  w: 5,  h: 6, minW: 3, minH: 4 },
      { i: 'w-clock',       x: 5, y: 3,  w: 4,  h: 4, minW: 3, minH: 3 },
      { i: 'w-weather',     x: 9, y: 3,  w: 3,  h: 4, minW: 3, minH: 3 },
      { i: 'w-email',       x: 0, y: 9,  w: 6,  h: 6, minW: 3, minH: 4 },
      { i: 'w-todo',        x: 6, y: 9,  w: 6,  h: 6, minW: 3, minH: 4 },
      { i: 'w-news',        x: 0, y: 15, w: 12, h: 4, minW: 4, minH: 3 },
    ],
    // md (8 cols): briefing banner; clock + weather one row;
    // calendar/email/todo two-column; news full width (design §6).
    md: [
      { i: 'w-briefing',    x: 0, y: 0,  w: 8, h: 3, minW: 4, minH: 2 },
      { i: 'w-clock',       x: 0, y: 3,  w: 4, h: 3, minW: 3, minH: 3 },
      { i: 'w-weather',     x: 4, y: 3,  w: 4, h: 3, minW: 3, minH: 3 },
      { i: 'w-calendar',    x: 0, y: 6,  w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-email',       x: 4, y: 6,  w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-todo',        x: 0, y: 12, w: 4, h: 5, minW: 3, minH: 4 },
      { i: 'w-news',        x: 4, y: 12, w: 4, h: 5, minW: 3, minH: 4 },
    ],
    // sm (6 cols): single column. Order = briefing → calendar → email → todo
    // → news → clock → weather (design §6).
    sm: [
      { i: 'w-briefing',    x: 0, y: 0,  w: 6, h: 3, minW: 4, minH: 2 },
      { i: 'w-calendar',    x: 0, y: 3,  w: 6, h: 5, minW: 4, minH: 4 },
      { i: 'w-email',       x: 0, y: 8,  w: 6, h: 5, minW: 4, minH: 4 },
      { i: 'w-todo',        x: 0, y: 13, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'w-news',        x: 0, y: 17, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'w-clock',       x: 0, y: 21, w: 6, h: 3, minW: 4, minH: 3 },
      { i: 'w-weather',     x: 0, y: 24, w: 6, h: 3, minW: 4, minH: 3 },
    ],
    // xs (4 cols): single column, same order as sm.
    xs: [
      { i: 'w-briefing',    x: 0, y: 0,  w: 4, h: 3, minW: 4, minH: 2 },
      { i: 'w-calendar',    x: 0, y: 3,  w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'w-email',       x: 0, y: 8,  w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'w-todo',        x: 0, y: 13, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'w-news',        x: 0, y: 17, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'w-clock',       x: 0, y: 21, w: 4, h: 3, minW: 4, minH: 3 },
      { i: 'w-weather',     x: 0, y: 24, w: 4, h: 3, minW: 4, minH: 3 },
    ],
  },
};

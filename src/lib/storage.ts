import Dexie, { type Table } from 'dexie';
import type { AppSettings, DashboardLayout, EmailAccount, EmailItem, TodoItem, TodoSuggestion, WidgetInstance } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { uid } from './id';

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
    id: uid(),
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

// confirm/ignore suggestions, todos, the scratchpad note, and email dismiss
// state now live on the backend (see lib/dataStore.ts). The Dexie tables below
// are kept only so the one-time migration can read any legacy browser data.

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
      id: uid(),
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
  // Order matters for single-column (sm/xs) flow: the "now" hero (time +
  // date + weather) first, then the email-centric stack. The briefing is a
  // separate always-on bottom dock (BriefingPlayer), not a grid widget.
  widgets: [
    { id: 'w-now', type: 'now' },
    { id: 'w-calendar', type: 'calendar' },
    { id: 'w-email', type: 'email' },
    { id: 'w-todo', type: 'todo' },
    { id: 'w-note', type: 'note' },
    { id: 'w-news', type: 'news' },
  ] as WidgetInstance[],
  layouts: {
    // lg (12 cols): daybreak hero banner on top; calendar + email + todo row;
    // news full-width bottom.
    lg: [
      { i: 'w-now',    x: 0, y: 0,  w: 12, h: 4, minW: 6, minH: 3 },
      { i: 'w-calendar',    x: 0, y: 4,  w: 4,  h: 7, minW: 3, minH: 4 },
      { i: 'w-email',       x: 4, y: 4,  w: 4,  h: 7, minW: 3, minH: 4 },
      { i: 'w-todo',        x: 8, y: 4,  w: 4,  h: 7, minW: 3, minH: 4 },
      { i: 'w-note',        x: 0, y: 11, w: 4,  h: 5, minW: 3, minH: 3 },
      { i: 'w-news',        x: 4, y: 11, w: 8,  h: 5, minW: 4, minH: 3 },
    ],
    // md (8 cols): daybreak banner; calendar/email two-column; todo/note row; news.
    md: [
      { i: 'w-now',    x: 0, y: 0,  w: 8, h: 4, minW: 4, minH: 3 },
      { i: 'w-calendar',    x: 0, y: 4,  w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-email',       x: 4, y: 4,  w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-todo',        x: 0, y: 10, w: 4, h: 5, minW: 3, minH: 4 },
      { i: 'w-note',        x: 4, y: 10, w: 4, h: 5, minW: 3, minH: 3 },
      { i: 'w-news',        x: 0, y: 15, w: 8, h: 4, minW: 3, minH: 3 },
    ],
    // sm (6 cols): single column. Order = daybreak → calendar → email → todo → note → news.
    sm: [
      { i: 'w-now',    x: 0, y: 0,  w: 6, h: 5, minW: 4, minH: 4 },
      { i: 'w-calendar',    x: 0, y: 5,  w: 6, h: 5, minW: 4, minH: 4 },
      { i: 'w-email',       x: 0, y: 10, w: 6, h: 5, minW: 4, minH: 4 },
      { i: 'w-todo',        x: 0, y: 15, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'w-note',        x: 0, y: 19, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'w-news',        x: 0, y: 23, w: 6, h: 4, minW: 4, minH: 3 },
    ],
    // xs (4 cols): single column, same order as sm.
    xs: [
      { i: 'w-now',    x: 0, y: 0,  w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'w-calendar',    x: 0, y: 5,  w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'w-email',       x: 0, y: 10, w: 4, h: 5, minW: 4, minH: 4 },
      { i: 'w-todo',        x: 0, y: 15, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'w-note',        x: 0, y: 19, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'w-news',        x: 0, y: 23, w: 4, h: 4, minW: 4, minH: 3 },
    ],
  },
};

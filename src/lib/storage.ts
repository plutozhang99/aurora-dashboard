import Dexie, { type Table } from 'dexie';
import type { AppSettings, DashboardLayout, EmailItem, TodoItem, WidgetInstance } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

interface KVRow { key: string; value: unknown }

class AuroraDB extends Dexie {
  kv!: Table<KVRow, string>;
  todos!: Table<TodoItem, string>;
  emails!: Table<EmailItem, string>;
  constructor() {
    super('aurora');
    this.version(1).stores({
      kv: '&key',
      todos: '&id, done, createdAt',
      emails: '&id, receivedAt, dismissed',
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

export async function loadSettings(): Promise<AppSettings> {
  const stored = await getKV<Partial<AppSettings>>('settings', {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // Deep-merge prompts so newly added defaults (e.g. new persona) appear for existing users.
  merged.prompts = {
    ...DEFAULT_SETTINGS.prompts,
    ...(stored.prompts ?? {}),
    personas: {
      ...DEFAULT_SETTINGS.prompts.personas,
      ...(stored.prompts?.personas ?? {}),
    },
  };
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

export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { id: 'w-clock', type: 'clock' },
    { id: 'w-weather', type: 'weather' },
    { id: 'w-calendar', type: 'calendar' },
    { id: 'w-email', type: 'email' },
    { id: 'w-todo', type: 'todo' },
    { id: 'w-system', type: 'system' },
    { id: 'w-news', type: 'news' },
    { id: 'w-music', type: 'music' },
    { id: 'w-chat', type: 'chat' },
    { id: 'w-agent-usage', type: 'agent-usage' },
  ] as WidgetInstance[],
  layouts: {
    lg: [
      { i: 'w-clock',       x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: 'w-weather',     x: 4, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: 'w-system',      x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: 'w-calendar',    x: 0, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-todo',        x: 4, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-email',       x: 8, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-news',        x: 0, y: 10, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-music',       x: 4, y: 10, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'w-agent-usage', x: 8, y: 10, w: 4, h: 3, minW: 3, minH: 3 },
      { i: 'w-chat',        x: 8, y: 13, w: 4, h: 3, minW: 3, minH: 3 },
    ],
    md: [
      { i: 'w-clock',       x: 0, y: 0, w: 4, h: 3 },
      { i: 'w-weather',     x: 4, y: 0, w: 4, h: 3 },
      { i: 'w-system',      x: 0, y: 3, w: 4, h: 3 },
      { i: 'w-calendar',    x: 4, y: 3, w: 4, h: 5 },
      { i: 'w-todo',        x: 0, y: 6, w: 4, h: 5 },
      { i: 'w-email',       x: 4, y: 8, w: 4, h: 5 },
      { i: 'w-news',        x: 0, y: 11, w: 4, h: 5 },
      { i: 'w-music',       x: 4, y: 13, w: 4, h: 4 },
      { i: 'w-chat',        x: 0, y: 16, w: 4, h: 4 },
      { i: 'w-agent-usage', x: 4, y: 17, w: 4, h: 3 },
    ],
    sm: [
      { i: 'w-clock',       x: 0, y: 0, w: 6, h: 3 },
      { i: 'w-weather',     x: 0, y: 3, w: 6, h: 3 },
      { i: 'w-system',      x: 0, y: 6, w: 6, h: 3 },
      { i: 'w-calendar',    x: 0, y: 9, w: 6, h: 4 },
      { i: 'w-todo',        x: 0, y: 13, w: 6, h: 4 },
      { i: 'w-email',       x: 0, y: 17, w: 6, h: 4 },
      { i: 'w-news',        x: 0, y: 21, w: 6, h: 4 },
      { i: 'w-music',       x: 0, y: 25, w: 6, h: 4 },
      { i: 'w-chat',        x: 0, y: 29, w: 6, h: 3 },
      { i: 'w-agent-usage', x: 0, y: 32, w: 6, h: 3 },
    ],
    xs: [
      { i: 'w-clock',       x: 0, y: 0, w: 4, h: 3 },
      { i: 'w-weather',     x: 0, y: 3, w: 4, h: 3 },
      { i: 'w-system',      x: 0, y: 6, w: 4, h: 3 },
      { i: 'w-calendar',    x: 0, y: 9, w: 4, h: 4 },
      { i: 'w-todo',        x: 0, y: 13, w: 4, h: 4 },
      { i: 'w-email',       x: 0, y: 17, w: 4, h: 4 },
      { i: 'w-news',        x: 0, y: 21, w: 4, h: 4 },
      { i: 'w-music',       x: 0, y: 25, w: 4, h: 4 },
      { i: 'w-chat',        x: 0, y: 29, w: 4, h: 3 },
      { i: 'w-agent-usage', x: 0, y: 32, w: 4, h: 3 },
    ],
  },
};

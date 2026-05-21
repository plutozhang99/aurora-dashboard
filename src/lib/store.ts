import { create } from 'zustand';
import type { AppSettings, DashboardLayout, WidgetInstance, LayoutItem, Breakpoint } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { DEFAULT_LAYOUT, loadLayout, loadSettings, saveLayout, saveSettings } from './storage';

interface UIState {
  settingsOpen: boolean;
  editMode: boolean;
  chatOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  setEditMode: (v: boolean) => void;
  setChatOpen: (v: boolean) => void;
}

interface DataState {
  ready: boolean;
  settings: AppSettings;
  layout: DashboardLayout;
  init: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setLayouts: (bp: Breakpoint, items: LayoutItem[]) => Promise<void>;
  addWidget: (w: WidgetInstance, item: LayoutItem) => Promise<void>;
  removeWidget: (id: string) => Promise<void>;
  resetLayout: () => Promise<void>;
  autoFitLayout: () => Promise<void>;
}

export const useUI = create<UIState>((set) => ({
  settingsOpen: false,
  editMode: false,
  chatOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setEditMode: (v) => set({ editMode: v }),
  setChatOpen: (v) => set({ chatOpen: v }),
}));

export const useStore = create<DataState>((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  layout: DEFAULT_LAYOUT,
  init: async () => {
    const [settings, layout] = await Promise.all([loadSettings(), loadLayout()]);
    set({ settings, layout: layout ?? DEFAULT_LAYOUT, ready: true });
  },
  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await saveSettings(next);
  },
  setLayouts: async (bp, items) => {
    const next: DashboardLayout = {
      ...get().layout,
      layouts: { ...get().layout.layouts, [bp]: items },
    };
    set({ layout: next });
    await saveLayout(next);
  },
  addWidget: async (w, item) => {
    const cur = get().layout;
    const widgets = [...cur.widgets, w];
    const layouts = { ...cur.layouts };
    (['lg', 'md', 'sm', 'xs'] as Breakpoint[]).forEach((bp) => {
      layouts[bp] = [...layouts[bp], { ...item, i: w.id }];
    });
    const next = { widgets, layouts };
    set({ layout: next });
    await saveLayout(next);
  },
  removeWidget: async (id) => {
    const cur = get().layout;
    const next: DashboardLayout = {
      widgets: cur.widgets.filter((w) => w.id !== id),
      layouts: {
        lg: cur.layouts.lg.filter((l) => l.i !== id),
        md: cur.layouts.md.filter((l) => l.i !== id),
        sm: cur.layouts.sm.filter((l) => l.i !== id),
        xs: cur.layouts.xs.filter((l) => l.i !== id),
      },
    };
    set({ layout: next });
    await saveLayout(next);
  },
  resetLayout: async () => {
    set({ layout: DEFAULT_LAYOUT });
    await saveLayout(DEFAULT_LAYOUT);
  },
  autoFitLayout: async () => {
    const cur = get().layout;
    const next: DashboardLayout = {
      widgets: cur.widgets,
      layouts: {
        lg: autoFit(cur.widgets, 12, 16),
        md: autoFit(cur.widgets, 8, 18),
        sm: autoFit(cur.widgets, 6, 24),
        xs: autoFit(cur.widgets, 4, 32),
      },
    };
    set({ layout: next });
    await saveLayout(next);
  },
}));

// Widget category weights — drives column distribution & ideal heights.
const WEIGHT: Record<string, number> = {
  clock: 1, weather: 1, system: 1, 'agent-usage': 1, chat: 1,
  calendar: 2, todo: 2, email: 2, news: 2, music: 2,
};

/**
 * Greedy column-packed layout: distributes widgets into `cols / colW` columns,
 * always appending the next widget to the shortest column, then stretches each
 * column's heights proportionally to fill exactly `targetRows` rows. This way
 * the whole grid spans the viewport with no trailing whitespace.
 */
function autoFit(widgets: WidgetInstance[], cols: number, targetRows: number): LayoutItem[] {
  if (!widgets.length) return [];
  const colCount = cols >= 12 ? 3 : cols >= 8 ? 2 : 1;
  const colW = Math.floor(cols / colCount);
  const columns: { items: { id: string; weight: number }[]; sum: number }[] =
    Array.from({ length: colCount }, () => ({ items: [], sum: 0 }));

  for (const w of widgets) {
    const weight = WEIGHT[w.type] ?? 2;
    const dest = columns.reduce((min, c) => (c.sum < min.sum ? c : min), columns[0]);
    dest.items.push({ id: w.id, weight });
    dest.sum += weight;
  }

  const out: LayoutItem[] = [];
  columns.forEach((col, idx) => {
    if (!col.items.length) return;
    // Scale each item's row span so the column sums to targetRows.
    const scale = targetRows / col.sum;
    const raw = col.items.map((it) => Math.max(3, Math.round(it.weight * scale)));
    // Adjust last row to absorb rounding drift.
    const drift = targetRows - raw.reduce((a, b) => a + b, 0);
    raw[raw.length - 1] = Math.max(3, raw[raw.length - 1] + drift);
    let y = 0;
    col.items.forEach((it, i) => {
      const h = raw[i];
      out.push({
        i: it.id,
        x: idx * colW,
        y,
        w: colW,
        h,
        minW: Math.min(3, colW),
        minH: 3,
      });
      y += h;
    });
  });
  return out;
}

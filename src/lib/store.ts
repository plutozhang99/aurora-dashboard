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
}));

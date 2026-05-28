import { describe, it, expect } from 'vitest';
import { reconcileLayout, DEFAULT_LAYOUT } from './storage';
import type { DashboardLayout, WidgetInstance } from '@/types';

describe('reconcileLayout', () => {
  it('returns DEFAULT_LAYOUT for a fresh install (null)', () => {
    expect(reconcileLayout(null)).toBe(DEFAULT_LAYOUT);
  });

  it('resets a stale pre-rescope layout containing a removed widget type', () => {
    // `system` / `music` are no longer valid WidgetTypes after the rescope.
    const stale = {
      widgets: [
        { id: 'w-clock', type: 'clock' },
        { id: 'w-system', type: 'system' },
        { id: 'w-music', type: 'music' },
      ] as unknown as WidgetInstance[],
      layouts: { lg: [], md: [], sm: [], xs: [] },
    } as DashboardLayout;
    expect(reconcileLayout(stale)).toBe(DEFAULT_LAYOUT);
  });

  it('preserves a valid new-schema layout unchanged (identity)', () => {
    const valid: DashboardLayout = {
      widgets: [
        { id: 'w-briefing', type: 'briefing' },
        { id: 'w-clock', type: 'clock' },
        { id: 'w-weather', type: 'weather' },
        { id: 'w-calendar', type: 'calendar' },
        { id: 'w-email', type: 'email' },
        { id: 'w-todo', type: 'todo' },
        { id: 'w-news', type: 'news' },
      ],
      layouts: { lg: [], md: [], sm: [], xs: [] },
    };
    expect(reconcileLayout(valid)).toBe(valid);
  });
});

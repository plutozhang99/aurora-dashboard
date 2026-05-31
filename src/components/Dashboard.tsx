import { Grid, Flex } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { WidgetWrapper } from './WidgetWrapper';
import { renderWidget } from './widgets';
import type { Breakpoint } from '@/types';

const COLUMN_HINT: Record<string, number> = {
  now: 1.35,
  calendar: 1,
  email: 1.15,
  todo: 1,
  note: 1,
  news: 1.25,
};

export function Dashboard() {
  const layout = useStore((s) => s.layout);
  const screens = Grid.useBreakpoint();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(720);
  const breakpoint: Breakpoint = screens.xl ? 'lg' : screens.md ? 'md' : screens.sm ? 'sm' : 'xs';
  const columnCount = breakpoint === 'lg' ? 3 : breakpoint === 'md' ? 2 : 1;

  useEffect(() => {
    function recompute() {
      const top = containerRef.current?.getBoundingClientRect().top ?? 72;
      setAvailableHeight(Math.max(420, window.innerHeight - top - 124));
    }

    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
    };
  }, []);

  const columns = useMemo(() => {
    const items = new Map((layout.layouts[breakpoint] ?? []).map((item) => [item.i, item]));
    const next = Array.from({ length: columnCount }, () => ({
      height: 0,
      widgets: [] as { widget: typeof layout.widgets[number]; rows: number }[],
    }));

    for (const widget of layout.widgets) {
      const rows = Math.max(3, items.get(widget.id)?.h ?? Math.round((COLUMN_HINT[widget.type] ?? 1) * 5));
      const target = next.reduce((shortest, col) => (col.height < shortest.height ? col : shortest), next[0]);
      target.widgets.push({ widget, rows });
      target.height += rows;
    }

    return next.map((col) => col.widgets);
  }, [breakpoint, columnCount, layout.layouts, layout.widgets]);

  const maxRows = Math.max(1, ...columns.map((column) => column.reduce((sum, item) => sum + item.rows, 0)));
  const maxGaps = Math.max(0, ...columns.map((column) => column.length - 1));
  const rowHeight = Math.max(44, Math.floor((availableHeight - maxGaps * 16) / maxRows));

  return (
    <Flex ref={containerRef} className="dashboard-masonry" gap={16} align="flex-start">
      {columns.map((widgets, index) => (
        <Flex key={index} vertical gap={16} flex={1} className="masonry-column">
          {widgets.map(({ widget, rows }) => (
            <WidgetWrapper key={widget.id} widget={widget} height={rows * rowHeight}>
              {renderWidget(widget)}
            </WidgetWrapper>
          ))}
        </Flex>
      ))}
    </Flex>
  );
}

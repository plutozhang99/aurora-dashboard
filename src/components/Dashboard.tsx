import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useMemo, useEffect, useRef, useState } from 'react';
import { useStore, useUI } from '@/lib/store';
import { WidgetWrapper } from './WidgetWrapper';
import { renderWidget } from './widgets';
import type { Breakpoint } from '@/types';

const RGL = WidthProvider(Responsive);

export function Dashboard() {
  const layout = useStore((s) => s.layout);
  const setLayouts = useStore((s) => s.setLayouts);
  const editMode = useUI((s) => s.editMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(64);

  // Fit content to viewport (no-scroll). We compute rowHeight based on the
  // container's actual inner area divided by max layout row count.
  useEffect(() => {
    function recompute() {
      const el = containerRef.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const available = el.clientHeight - padTop - padBottom;
      const bp = pickBreakpoint(window.innerWidth);
      const items = layout.layouts[bp];
      if (!items.length) return;
      const maxRow = Math.max(...items.map((l) => l.y + l.h));
      const margin = 12;
      // formula matches react-grid-layout: total = rows * rowHeight + (rows-1) * margin
      const rh = Math.max(36, Math.floor((available - (maxRow - 1) * margin) / maxRow));
      setRowHeight(rh);
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('orientationchange', recompute);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, [layout]);

  const items = useMemo(() => layout.widgets, [layout.widgets]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pt-12 pb-2 px-3 overflow-hidden"
    >
      <RGL
        className="layout"
        layouts={layout.layouts}
        breakpoints={{ lg: 1280, md: 996, sm: 720, xs: 0 }}
        cols={{ lg: 12, md: 8, sm: 6, xs: 4 }}
        rowHeight={rowHeight}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        compactType="vertical"
        preventCollision={false}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".drag-handle"
        onLayoutChange={(_current, all) => {
          (Object.keys(all) as Breakpoint[]).forEach((bp) => {
            setLayouts(bp, all[bp] as Layout[]);
          });
        }}
      >
        {items.map((w) => (
          <div key={w.id} className="">
            <WidgetWrapper widget={w}>{renderWidget(w)}</WidgetWrapper>
          </div>
        ))}
      </RGL>
    </div>
  );
}

function pickBreakpoint(w: number): Breakpoint {
  if (w >= 1280) return 'lg';
  if (w >= 996) return 'md';
  if (w >= 720) return 'sm';
  return 'xs';
}

import { GripVertical, X } from 'lucide-react';
import { useStore, useUI } from '@/lib/store';
import type { WidgetInstance } from '@/types';
import { ReactNode } from 'react';

export function WidgetWrapper({ widget, children }: { widget: WidgetInstance; children: ReactNode }) {
  const editMode = useUI((s) => s.editMode);
  const remove = useStore((s) => s.removeWidget);
  return (
    <div className="glass glass-hover rounded-2xl h-full w-full overflow-hidden relative flex flex-col">
      {editMode && (
        <>
          <div className="drag-handle absolute top-2 left-2 z-10 w-6 h-6 rounded-md bg-black/30 grid place-items-center text-white/70 hover:text-white">
            <GripVertical size={14} />
          </div>
          <button
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md bg-black/30 grid place-items-center text-white/70 hover:text-rose-400"
            onClick={() => remove(widget.id)}
            title="移除此组件"
          >
            <X size={14} />
          </button>
        </>
      )}
      <div className="flex-1 min-h-0 p-3">{children}</div>
    </div>
  );
}

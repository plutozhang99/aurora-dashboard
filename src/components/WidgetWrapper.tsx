import { GripVertical, X } from 'lucide-react';
import { Button, Card, CardContent } from '@heroui/react';
import { useStore, useUI } from '@/lib/store';
import type { WidgetInstance } from '@/types';
import { ReactNode } from 'react';

export function WidgetWrapper({ widget, children }: { widget: WidgetInstance; children: ReactNode }) {
  const editMode = useUI((s) => s.editMode);
  const remove = useStore((s) => s.removeWidget);
  return (
    <Card className="reveal h-full w-full overflow-hidden relative flex flex-col bg-card shadow-card hover:shadow-card-hover transition-shadow">
      {editMode && (
        <>
          <div className="drag-handle absolute top-2 left-2 z-10 w-6 h-6 rounded-md bg-paper-2 border border-rule grid place-items-center text-ink-3 hover:text-ink">
            <GripVertical size={14} />
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            onPress={() => remove(widget.id)}
            aria-label="移除此组件"
            className="absolute top-2 right-2 z-10 w-6 h-6 min-w-0 rounded-md bg-paper-2 border border-rule"
          >
            <X size={14} />
          </Button>
        </>
      )}
      <CardContent className="flex-1 min-h-0 p-3.5">{children}</CardContent>
    </Card>
  );
}

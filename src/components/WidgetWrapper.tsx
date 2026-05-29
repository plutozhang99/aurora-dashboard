import { Button, Card, Flex, Tooltip } from 'antd';
import { useStore, useUI } from '@/lib/store';
import type { WidgetInstance } from '@/types';
import type { CSSProperties, ReactNode } from 'react';

export function WidgetWrapper({ widget, children, height }: { widget: WidgetInstance; children: ReactNode; height?: number }) {
  const editMode = useUI((s) => s.editMode);
  const remove = useStore((s) => s.removeWidget);
  const style: CSSProperties | undefined = height ? { height } : undefined;

  return (
    <Card className="widget-card reveal" style={style} styles={{ body: { minHeight: 0, height: '100%', padding: 16 } }}>
      {editMode && (
        <Flex className="widget-actions" gap={8}>
          <Tooltip title="移除此组件">
            <Button size="small" danger onClick={() => remove(widget.id)}>
              移除
            </Button>
          </Tooltip>
        </Flex>
      )}
      {children}
    </Card>
  );
}

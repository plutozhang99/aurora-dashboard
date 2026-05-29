import { Button, Flex, Layout, Space, Typography } from 'antd';
import { useStore, useUI } from '@/lib/store';

export function TopBar() {
  const { setSettingsOpen, setEditMode, editMode } = useUI();
  const reset = useStore((s) => s.resetLayout);
  const autoFit = useStore((s) => s.autoFitLayout);

  return (
    <Layout.Header className="top-bar">
      <Flex align="center" justify="space-between" gap={12}>
        <Space align="baseline" size={10} className="brand-lockup">
          <Typography.Title level={3} className="brand-title">
            Aurora<span className="brand-dot">.</span>
          </Typography.Title>
          <Typography.Text className="kicker top-subtitle">个人面板 · Personal Almanac</Typography.Text>
        </Space>

        <Space.Compact>
          <Button type={editMode ? 'primary' : 'default'} onClick={() => setEditMode(!editMode)}>
            {editMode ? '完成' : '布局'}
          </Button>
          {editMode && (
            <>
              <Button onClick={() => autoFit()}>填满</Button>
              <Button onClick={() => reset()}>重置</Button>
            </>
          )}
          <Button onClick={() => setSettingsOpen(true)}>设置</Button>
        </Space.Compact>
      </Flex>
    </Layout.Header>
  );
}

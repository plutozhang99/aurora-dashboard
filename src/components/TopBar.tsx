import { Settings, Pencil, RotateCcw, LayoutGrid, Check } from 'lucide-react';
import { Button } from '@heroui/react';
import { useStore, useUI } from '@/lib/store';

export function TopBar() {
  const { setSettingsOpen, setEditMode, editMode } = useUI();
  const reset = useStore((s) => s.resetLayout);
  const autoFit = useStore((s) => s.autoFitLayout);

  return (
    <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-5 h-11 bg-paper border-b border-rule select-none">
      <div className="flex items-baseline gap-2.5 min-w-0">
        <div className="font-display text-[22px] leading-none tracking-tight text-ink">
          Aurora<span className="text-ember">.</span>
        </div>
        <div className="kicker hidden sm:block truncate">个人面板 · Personal Almanac</div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant={editMode ? 'primary' : 'secondary'}
          onPress={() => setEditMode(!editMode)}
          aria-label="编辑布局"
        >
          {editMode ? <Check size={14} /> : <Pencil size={14} />}
          {editMode ? '完成' : '布局'}
        </Button>
        {editMode && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => autoFit()}
              aria-label="按当前组件数量均衡铺满屏幕"
            >
              <LayoutGrid size={14} /> 填满
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => reset()}
              aria-label="重置为默认布局"
            >
              <RotateCcw size={14} /> 重置
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="secondary"
          onPress={() => setSettingsOpen(true)}
          aria-label="设置"
        >
          <Settings size={14} /> 设置
        </Button>
      </div>
    </div>
  );
}

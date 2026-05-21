import { Settings, Pencil, MessageCircle, RotateCcw, LayoutGrid } from 'lucide-react';
import { useStore, useUI } from '@/lib/store';

export function TopBar() {
  const { setSettingsOpen, setEditMode, setChatOpen, editMode } = useUI();
  const reset = useStore((s) => s.resetLayout);
  const autoFit = useStore((s) => s.autoFitLayout);
  return (
    <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-5 pt-3 pb-2 select-none">
      <div className="flex items-center gap-2">
        <div className="text-xl font-display font-semibold gradient-text">Aurora</div>
        <div className="text-[11px] text-white/40 hidden md:block">Local-first AI dashboard</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={`btn ${editMode ? 'btn-primary' : ''}`}
          onClick={() => setEditMode(!editMode)}
          title="编辑布局 — 拖拽/调整大小"
        >
          <Pencil size={14} /> {editMode ? '完成' : '布局'}
        </button>
        {editMode && (
          <>
            <button className="btn" onClick={() => autoFit()} title="按当前组件数量均衡铺满屏幕">
              <LayoutGrid size={14} /> 填满
            </button>
            <button className="btn" onClick={() => reset()} title="重置为默认布局">
              <RotateCcw size={14} /> 重置
            </button>
          </>
        )}
        <button className="btn" onClick={() => setChatOpen(true)} title="打开 AI 聊天">
          <MessageCircle size={14} /> 聊天
        </button>
        <button className="btn" onClick={() => setSettingsOpen(true)} title="设置">
          <Settings size={14} /> 设置
        </button>
      </div>
    </div>
  );
}

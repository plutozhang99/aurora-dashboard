import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare, Plus, Trash2, Square } from 'lucide-react';
import { db } from '@/lib/storage';
import type { TodoItem } from '@/types';
import { Header } from './CalendarWidget';

export function TodoWidget() {
  const items = useLiveQuery(async () => {
    const rows = await db.todos.orderBy('createdAt').reverse().toArray();
    return rows;
  }, [], [] as TodoItem[]);

  const [input, setInput] = useState('');

  async function add() {
    const t = input.trim();
    if (!t) return;
    const id = crypto.randomUUID();
    await db.todos.put({ id, text: t, done: false, createdAt: Date.now() });
    setInput('');
  }

  async function toggle(it: TodoItem) {
    await db.todos.put({ ...it, done: !it.done });
  }

  async function del(id: string) {
    await db.todos.delete(id);
  }

  const remaining = items?.filter((i) => !i.done).length ?? 0;

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<CheckSquare size={14} />} title="今日待办" right={`剩 ${remaining}`} />
      <div className="flex gap-2 mt-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="新增一项待办…"
        />
        <button className="btn btn-primary" onClick={add}><Plus size={14} /></button>
      </div>
      <div className="flex-1 min-h-0 scroll-area space-y-1.5 mt-2">
        {items?.map((it) => (
          <div key={it.id} className="rounded-lg bg-white/5 px-3 py-2 flex items-center gap-2 group">
            <button onClick={() => toggle(it)} className="text-white/70 hover:text-white">
              {it.done ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <div className={`flex-1 text-sm ${it.done ? 'line-through text-white/40' : ''} truncate`}>{it.text}</div>
            <button onClick={() => del(it.id)} className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-rose-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {(!items || items.length === 0) && (
          <div className="text-white/40 text-sm text-center py-4">还没有待办，添加一项开始吧 ✨</div>
        )}
      </div>
    </div>
  );
}

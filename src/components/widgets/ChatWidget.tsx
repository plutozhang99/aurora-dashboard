import { MessageCircle } from 'lucide-react';
import { useUI, useStore } from '@/lib/store';
import { PERSONAS } from '@/types';
import { Header } from './CalendarWidget';

export function ChatWidget() {
  const open = useUI((s) => s.setChatOpen);
  const personaId = useStore((s) => s.settings.aiPersona);
  const updateSettings = useStore((s) => s.updateSettings);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<MessageCircle size={14} />} title="AI 聊天" />
      <div className="flex-1 min-h-0 mt-2 flex flex-col">
        <div className="text-sm text-white/70 leading-snug">
          当前风格 <span className="text-white">{persona.emoji} {persona.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              className={`rounded-lg px-2 py-1.5 text-xs ${p.id === personaId ? 'bg-aurora-violet/30 border border-aurora-violet' : 'bg-white/5 hover:bg-white/10'}`}
              onClick={() => updateSettings({ aiPersona: p.id })}
              title={p.systemPrompt}
            >
              <div className="text-lg leading-none">{p.emoji}</div>
              <div className="text-[10px] mt-0.5 truncate">{p.name}</div>
            </button>
          ))}
        </div>
        <button className="btn btn-primary mt-auto" onClick={() => open(true)}>打开聊天</button>
      </div>
    </div>
  );
}

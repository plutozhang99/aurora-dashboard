import { MessageCircle } from 'lucide-react';
import { useUI, useStore } from '@/lib/store';
import { PERSONAS, effectivePersonaPrompt } from '@/types';
import { Header } from './CalendarWidget';

export function ChatWidget() {
  const open = useUI((s) => s.setChatOpen);
  const settings = useStore((s) => s.settings);
  const personaId = settings.aiPersona;
  const updateSettings = useStore((s) => s.updateSettings);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<MessageCircle size={14} />} title="AI 聊天" />
      <div className="flex-1 min-h-0 mt-2 flex flex-col">
        <div className="text-sm text-white/70 leading-snug">
          当前风格 <span className="text-white">{persona.emoji} {persona.name}</span>
        </div>
        <div className="flex gap-1 mt-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-thin">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              className={`shrink-0 rounded-lg px-2 py-1.5 text-xs flex items-center gap-1.5 ${p.id === personaId ? 'bg-aurora-violet/30 border border-aurora-violet' : 'bg-white/5 hover:bg-white/10 border border-transparent'}`}
              onClick={() => updateSettings({ aiPersona: p.id })}
              title={effectivePersonaPrompt(settings, p.id)}
            >
              <span className="text-base leading-none">{p.emoji}</span>
              <span className="text-[11px] whitespace-nowrap">{p.name}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary mt-auto" onClick={() => open(true)}>打开聊天</button>
      </div>
    </div>
  );
}

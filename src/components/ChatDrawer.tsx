import { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { useStore, useUI } from '@/lib/store';
import { chat, type ChatMessage } from '@/lib/ai';
import { PERSONAS } from '@/types';

export function ChatDrawer() {
  const close = useUI((s) => s.setChatOpen);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const persona = PERSONAS.find((p) => p.id === settings.aiPersona) ?? PERSONAS[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await chat(settings, persona, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${e?.message ?? String(e)}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute top-12 right-3 bottom-3 z-30 w-[min(420px,calc(100vw-24px))] glass rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="text-lg">{persona.emoji}</div>
          <select
            className="input !py-1 !w-auto"
            value={settings.aiPersona}
            onChange={(e) => updateSettings({ aiPersona: e.target.value })}
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </select>
        </div>
        <button className="text-white/60 hover:text-white" onClick={() => close(false)}><X /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto scroll-area px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-white/40 text-center py-8">和 {persona.name} 说点什么吧 ✨</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-aurora-violet to-aurora-blue text-white'
                  : 'bg-white/8 border border-white/10'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-white/40">{persona.name} 正在思考…</div>}
      </div>
      <div className="border-t border-white/10 p-3 flex gap-2">
        <input
          className="input"
          placeholder="说点什么…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="btn btn-primary" disabled={loading} onClick={send}><Send size={14} /></button>
      </div>
    </div>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Check } from 'lucide-react';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { db } from '@/lib/storage';
import type { EmailItem } from '@/types';
import { Header } from './CalendarWidget';

export function EmailWidget() {
  const settings = useStore((s) => s.settings);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email', settings.emailEnabled, settings.emailUser],
    queryFn: async (): Promise<EmailItem[]> => {
      if (!settings.emailEnabled) return [];
      const has = await apiAvailable();
      if (!has) return [];
      const res = await api<{ items: EmailItem[] }>(`/email/important`, {
        method: 'POST',
        body: JSON.stringify({
          host: settings.emailHost, port: settings.emailPort,
          user: settings.emailUser, pass: settings.emailPassword, secure: settings.emailSecure,
        }),
      }).catch(() => ({ items: [] as EmailItem[] }));
      return res.items;
    },
    refetchInterval: 1000 * 60 * 5,
  });

  // Merge fetched + dismissed state stored in IndexedDB
  const { data: localState } = useQuery({
    queryKey: ['email-local'],
    queryFn: async () => {
      const rows = await db.emails.toArray();
      return new Map(rows.map((r) => [r.id, r] as const));
    },
  });

  useEffect(() => {
    if (!data) return;
    (async () => {
      for (const m of data) {
        const existing = await db.emails.get(m.id);
        if (!existing) await db.emails.put(m);
      }
    })();
  }, [data]);

  async function dismiss(id: string) {
    const row = (await db.emails.get(id)) ?? { id, from: '', subject: '', snippet: '', receivedAt: Date.now(), important: true, dismissed: false };
    await db.emails.put({ ...row, dismissed: true });
    qc.invalidateQueries({ queryKey: ['email-local'] });
  }

  const visible = (data ?? []).filter((m) => {
    const row = localState?.get(m.id);
    return !row?.dismissed;
  });

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<Mail size={14} />} title="重要邮件" right={`${visible.length} 未阅`} />
      <div className="flex-1 min-h-0 scroll-area space-y-2 mt-2">
        {!settings.emailEnabled && (
          <div className="text-white/40 text-sm">未启用 IMAP — 设置 → 邮件 中配置后再启动本地后端。</div>
        )}
        {settings.emailEnabled && isLoading && <div className="text-white/40 text-sm">收取中…</div>}
        {settings.emailEnabled && !isLoading && visible.length === 0 && (
          <div className="text-white/40 text-sm">没有需要关注的邮件 🎉</div>
        )}
        {visible.map((m) => (
          <div key={m.id} className="rounded-lg bg-white/5 px-3 py-2 flex items-start gap-3 group">
            <button
              className="mt-0.5 w-5 h-5 rounded-md border border-white/30 grid place-items-center hover:bg-white/10"
              onClick={() => dismiss(m.id)}
              title="标记已查看，从此清单中移除"
            >
              <Check size={12} className="opacity-0 group-hover:opacity-100" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate flex items-center gap-2">
                <span className="text-white/90">{m.subject || '(无主题)'}</span>
              </div>
              <div className="text-[11px] text-white/50 truncate">{m.from}</div>
              <div className="text-[11px] text-white/40 truncate">{m.snippet}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

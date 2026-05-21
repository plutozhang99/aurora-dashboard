import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { CalendarDays } from 'lucide-react';

interface ScheduleItem { id: string; time: string; title: string; source: string }

export function CalendarWidget() {
  const settings = useStore((s) => s.settings);
  const { data, isLoading } = useQuery({
    queryKey: ['schedule', settings.emailEnabled, settings.emailUser],
    queryFn: async () => {
      if (!settings.emailEnabled) return { items: [] as ScheduleItem[], hasBackend: false };
      const has = await apiAvailable();
      if (!has) return { items: [], hasBackend: false };
      const res = await api<{ items: ScheduleItem[] }>(`/schedule/today`, {
        method: 'POST',
        body: JSON.stringify({
          host: settings.emailHost, port: settings.emailPort,
          user: settings.emailUser, pass: settings.emailPassword, secure: settings.emailSecure,
        }),
      }).catch(() => ({ items: [] as ScheduleItem[] }));
      return { items: res.items, hasBackend: true };
    },
    refetchInterval: 1000 * 60 * 10,
  });

  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<CalendarDays size={14} />} title="今日日程" right={today} />
      <div className="flex-1 min-h-0 scroll-area space-y-2 mt-2">
        {isLoading && <div className="text-white/40 text-sm">加载中…</div>}
        {!isLoading && (!data || data.items.length === 0) && (
          <div className="text-white/40 text-sm">
            {settings.emailEnabled
              ? '今天没有从邮件中识别的日程 — 后端会从邮件正文解析"会议/约会/截止"。'
              : '请在设置 → 邮件中启用 IMAP，并启动本地后端以从邮件中提取日程。'}
          </div>
        )}
        {data?.items.map((it) => (
          <div key={it.id} className="rounded-lg bg-white/5 px-3 py-2 flex items-start gap-3">
            <div className="font-mono text-aurora-cyan text-sm w-12 shrink-0">{it.time}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{it.title}</div>
              <div className="text-[10px] text-white/40 truncate">{it.source}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Header({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-white/70 text-sm">{icon}<span>{title}</span></div>
      {right && <div className="text-[11px] text-white/40">{right}</div>}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { api, apiAvailable } from '@/lib/api';
import { Header } from './CalendarWidget';

interface UsageReport {
  agents: Array<{
    name: string;
    messagesUsed?: number;
    messageQuota?: number;
    resetAt?: number;  // ms epoch
    note?: string;
  }>;
  source: string;
}

/**
 * Aurora reads ONLY the local agent CLI's own state files (e.g. ~/.claude
 * cache, ~/.codex cache). It does not call vendor APIs that would risk a
 * Terms-of-Service violation. If the CLI does not expose a session/quota file,
 * the widget shows the manual-input view instead — the user can record their
 * own reset time.
 */
export function AgentUsageWidget() {
  const { data, error } = useQuery({
    queryKey: ['agent-usage'],
    queryFn: async (): Promise<UsageReport | null> => {
      const ok = await apiAvailable();
      if (!ok) return null;
      return await api<UsageReport>('/agents/usage');
    },
    refetchInterval: 1000 * 60 * 2,
  });

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<BarChart3 size={14} />} title="AI 用量" right={data?.source ? data.source : undefined} />
      <div className="flex-1 min-h-0 scroll-area mt-2 space-y-1.5 flex flex-col">
        {!data && (
          <div className="flex-1 grid place-items-center text-white/40 text-xs text-center px-2">
            后端读取 <code className="font-mono mx-1">~/.claude</code> /
            <code className="font-mono mx-1">~/.codex</code> 本地缓存里的会话与限额信息。
          </div>
        )}
        {data?.agents.map((a) => {
          const pct = a.messagesUsed && a.messageQuota ? a.messagesUsed / a.messageQuota : null;
          return (
            <div key={a.name} className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{a.name}</span>
                {a.resetAt && <span className="text-white/50">重置 {timeUntil(a.resetAt)}</span>}
              </div>
              {pct !== null && (
                <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-aurora-mint to-aurora-violet" style={{ width: `${Math.min(100, pct * 100)}%` }} />
                </div>
              )}
              {a.note && <div className="text-[10px] text-white/40 mt-1">{a.note}</div>}
            </div>
          );
        })}
        {error && <div className="text-rose-400/70 text-xs">{String(error)}</div>}
      </div>
    </div>
  );
}

function timeUntil(ts: number) {
  const diff = ts - Date.now();
  if (diff <= 0) return '可用';
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  return `${h}h ${m}m`;
}

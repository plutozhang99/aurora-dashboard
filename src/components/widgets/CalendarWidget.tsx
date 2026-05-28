import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { colorForAccount } from '@/lib/accountColors';
import { todayStr } from '@/lib/briefingTrigger';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import type { AppSettings, EmailAccount, AccountError } from '@/types';

interface ScheduleItem { id: string; time: string; title: string; source: string; sourceAccountId?: string }
interface ScheduleResponse { items: ScheduleItem[]; errors?: AccountError[] | null }

function enabledAccounts(settings: AppSettings): EmailAccount[] {
  return settings.emailAccounts.filter((a) => a.enabled);
}
/**
 * Stable key over the connection-relevant fields of each enabled account (not
 * just ids), so editing an existing account's credentials triggers a refetch.
 * In-memory only — never persisted/logged — so including the password is fine.
 */
function accountsKey(accounts: EmailAccount[]): string {
  return JSON.stringify(
    accounts.map((a) => [a.id, a.host, a.port, a.user, a.secure, a.password, a.enabled]),
  );
}

export function CalendarWidget() {
  const settings = useStore((s) => s.settings);
  const accounts = enabledAccounts(settings);

  const { data, isLoading } = useQuery({
    queryKey: ['schedule', accountsKey(accounts)],
    queryFn: async (): Promise<ScheduleResponse & { hasBackend: boolean }> => {
      if (accounts.length === 0) return { items: [], errors: null, hasBackend: true };
      const has = await apiAvailable();
      if (!has) return { items: [], errors: null, hasBackend: false };
      const res = await api<ScheduleResponse>(`/schedule/today`, {
        method: 'POST',
        body: JSON.stringify({
          accounts,
          mode: settings.scheduleMode,
          keywords: settings.scheduleHintKeywords,
          ai: settings.aiProvider !== 'none' && settings.aiApiKey
            ? { provider: settings.aiProvider, apiKey: settings.aiApiKey, model: settings.aiModel }
            : undefined,
          prompt: settings.prompts.scheduleExtract,
          today: todayStr(new Date()),
        }),
      }).catch(() => ({ items: [] as ScheduleItem[], errors: null }));
      return { ...res, hasBackend: true };
    },
    refetchInterval: 1000 * 60 * 10,
  });

  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const errors = data?.errors ?? [];
  const accountLabel = (id?: string) => {
    const a = settings.emailAccounts.find((x) => x.id === id);
    return a ? (a.label ? `${a.label} (${a.user})` : a.user) : '';
  };

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<CalendarDays size={14} />} title="今日日程" right={today} />
      <div className="flex-1 min-h-0 scroll-area space-y-2 mt-2">
        {isLoading && <div className="text-white/40 text-sm">加载中…</div>}
        {data && !data.hasBackend && <BackendDownNotice />}
        {data?.hasBackend && errors.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2 text-[11px] text-amber-200/80">
            {errors.length} 个账户收取失败：{errors.map((e) => accountLabel(e.accountId) || e.accountId).join('、')}
          </div>
        )}
        {data?.hasBackend && !isLoading && data.items.length === 0 && errors.length === 0 && (
          <div className="text-white/40 text-sm">
            {accounts.length > 0
              ? '今天没有从邮件中识别的日程 — 后端会从邮件正文解析"会议/约会/截止"。'
              : '请在设置 → 邮件中添加并启用账户，并启动本地后端以从邮件中提取日程。'}
          </div>
        )}
        {data?.items.map((it) => (
          <div key={it.id} className="rounded-lg bg-white/5 px-3 py-2 flex items-start gap-3">
            <div className="font-mono text-aurora-cyan text-sm w-12 shrink-0">{it.time}</div>
            <span
              className="mt-1.5 w-2 h-2 rounded-full shrink-0"
              style={{ background: colorForAccount(it.sourceAccountId ?? '') }}
              title={accountLabel(it.sourceAccountId)}
            />
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

/** Explicit "backend not running" state (design §7 / AE7). Shared by email + schedule. */
export function BackendDownNotice() {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-3 text-sm space-y-1">
      <div className="flex items-center gap-2 text-amber-200/90">
        <AlertTriangle size={14} /> 本地后端未运行
      </div>
      <div className="text-white/50 text-[12px] leading-relaxed">
        邮件、日程与晨报都需要后端。
        <br />
        <code className="text-white/60">docker compose up</code> 或 <code className="text-white/60">npm run dev</code> 后重试。
      </div>
    </div>
  );
}

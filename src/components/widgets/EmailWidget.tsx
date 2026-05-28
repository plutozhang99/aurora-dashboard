import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Check } from 'lucide-react';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { db } from '@/lib/storage';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, EmailItem, EmailAccount, AccountError } from '@/types';
import { Header, BackendDownNotice } from './CalendarWidget';

interface ImportantResponse {
  items: EmailItem[];
  errors?: AccountError[] | null;
}

/** Enabled accounts in the request shape the backend expects. */
function enabledAccounts(settings: AppSettings): EmailAccount[] {
  return settings.emailAccounts.filter((a) => a.enabled);
}

/**
 * Stable key that changes whenever any connection-relevant field of an enabled
 * account changes — not just its id. Editing an existing account's password/
 * host/port/user (same id) must trigger a refetch, so those fields are part of
 * the key. These keys live in memory only (never persisted/logged), so including
 * the password is what lets a corrected password re-fetch.
 */
function accountsKey(accounts: EmailAccount[]): string {
  return JSON.stringify(
    accounts.map((a) => [a.id, a.host, a.port, a.user, a.secure, a.password, a.enabled]),
  );
}

export function EmailWidget() {
  const settings = useStore((s) => s.settings);
  const qc = useQueryClient();
  const accounts = enabledAccounts(settings);

  const { data, isLoading } = useQuery({
    queryKey: ['email', accountsKey(accounts)],
    queryFn: async (): Promise<ImportantResponse & { hasBackend: boolean }> => {
      if (accounts.length === 0) return { items: [], errors: null, hasBackend: true };
      const has = await apiAvailable();
      if (!has) return { items: [], errors: null, hasBackend: false };
      const res = await api<ImportantResponse>(`/email/important`, {
        method: 'POST',
        body: JSON.stringify({
          accounts,
          mode: settings.emailImportanceMode,
          keywords: settings.emailImportanceKeywords,
          ai: settings.aiProvider !== 'none' && settings.aiApiKey
            ? { provider: settings.aiProvider, apiKey: settings.aiApiKey, model: settings.aiModel }
            : undefined,
          prompt: settings.prompts.emailImportance,
        }),
      }).catch(() => ({ items: [] as EmailItem[], errors: null }));
      return { ...res, hasBackend: true };
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
    if (!data?.items) return;
    (async () => {
      for (const m of data.items) {
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

  const visible = (data?.items ?? []).filter((m) => {
    const row = localState?.get(m.id);
    return !row?.dismissed;
  });

  const errors = data?.errors ?? [];
  const accountLabel = (id?: string) => {
    const a = settings.emailAccounts.find((x) => x.id === id);
    return a ? (a.label ? `${a.label} (${a.user})` : a.user) : '';
  };

  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<Mail size={14} />} title="重要邮件" right={`聚合 · ${visible.length}`} />
      <div className="flex-1 min-h-0 scroll-area space-y-2 mt-2">
        {isLoading && accounts.length > 0 && <div className="text-white/40 text-sm">收取中…</div>}
        {data && !data.hasBackend && <BackendDownNotice />}
        {data?.hasBackend && accounts.length === 0 && (
          <div className="text-white/40 text-sm">未添加邮箱账户 — 设置 → 邮件 中添加并启用后再启动本地后端。</div>
        )}
        {data?.hasBackend && errors.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2 text-[11px] text-amber-200/80">
            {errors.length} 个账户收取失败：{errors.map((e) => accountLabel(e.accountId) || e.accountId).join('、')}
          </div>
        )}
        {data?.hasBackend && !isLoading && accounts.length > 0 && visible.length === 0 && errors.length === 0 && (
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
            <span
              className="mt-1.5 w-2 h-2 rounded-full shrink-0"
              style={{ background: colorForAccount(m.sourceAccountId ?? '') }}
              title={accountLabel(m.sourceAccountId)}
            />
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

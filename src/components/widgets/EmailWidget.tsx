import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Check } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@heroui/react';
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

function enabledAccounts(settings: AppSettings): EmailAccount[] {
  return settings.emailAccounts.filter((a) => a.enabled);
}

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
      <Header icon={<Mail size={14} className="text-ember" />} title="重要邮件 · Inbox" right={`聚合 · ${visible.length}`} />
      <div className="flex-1 min-h-0 scroll-area mt-3">
        {isLoading && accounts.length > 0 && <div className="text-ink-3 text-sm">收取中…</div>}
        {data && !data.hasBackend && <BackendDownNotice />}
        {data?.hasBackend && accounts.length === 0 && (
          <div className="text-ink-3 text-sm leading-relaxed">未添加邮箱账户 — 设置 → 邮件 中添加并启用后再启动本地后端。</div>
        )}
        {data?.hasBackend && errors.length > 0 && (
          <div className="rounded-md bg-ember-soft px-3 py-1.5 text-[11px] text-ember-deep mb-2 num">
            {errors.length} 个账户收取失败：{errors.map((e) => accountLabel(e.accountId) || e.accountId).join('、')}
          </div>
        )}
        {data?.hasBackend && !isLoading && accounts.length > 0 && visible.length === 0 && errors.length === 0 && (
          <div className="text-ink-3 text-sm">没有需要关注的邮件 🎉</div>
        )}
        <div className="divide-y divide-rule">
          {visible.map((m) => (
            <div key={m.id} className="flex items-start gap-3 py-2 group">
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                onPress={() => dismiss(m.id)}
                aria-label="标记已查看"
                className="mt-0.5 w-5 h-5 min-w-0 rounded-md border border-rule"
              >
                <Check size={12} className="opacity-0 group-hover:opacity-100" />
              </Button>
              <span
                className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                style={{ background: colorForAccount(m.sourceAccountId ?? '') }}
                title={accountLabel(m.sourceAccountId)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{m.subject || '(无主题)'}</div>
                <div className="text-[11px] text-ink-2 truncate">{m.from}</div>
                <div className="text-[11px] text-ink-3 truncate">{m.snippet}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

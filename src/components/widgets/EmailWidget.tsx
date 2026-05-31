import { Alert, Badge, Button, Flex, List, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { aiPayload } from '@/lib/ai';
import { dismissEmailRemote, listDismissedEmails } from '@/lib/dataStore';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, EmailItem, EmailAccount, AccountError } from '@/types';
import { BackendDownNotice, WidgetHeader } from './CalendarWidget';

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
          ai: aiPayload(settings),
          prompt: settings.prompts.emailImportance,
        }),
      }).catch(() => ({ items: [] as EmailItem[], errors: null }));
      return { ...res, hasBackend: true };
    },
    refetchInterval: 1000 * 60 * 5,
  });

  const { data: dismissedRows } = useQuery({
    queryKey: ['email-dismissed'],
    queryFn: async (): Promise<EmailItem[]> => {
      const has = await apiAvailable();
      if (!has) return [];
      return listDismissedEmails();
    },
  });

  async function dismiss(m: EmailItem) {
    await dismissEmailRemote(m);
    qc.invalidateQueries({ queryKey: ['email-dismissed'] });
  }

  const dismissedIds = new Set((dismissedRows ?? []).filter((r) => r.dismissed).map((r) => r.id));
  const visible = (data?.items ?? []).filter((m) => !dismissedIds.has(m.id));

  const errors = data?.errors ?? [];
  const accountLabel = (id?: string) => {
    const a = settings.emailAccounts.find((x) => x.id === id);
    return a ? (a.label ? `${a.label} (${a.user})` : a.user) : '';
  };

  return (
    <Flex vertical className="widget-content">
      <WidgetHeader title="重要邮件 · Inbox" right={`聚合 · ${visible.length}`} />
      {isLoading && accounts.length > 0 && <Typography.Text type="secondary">收取中...</Typography.Text>}
      {data && !data.hasBackend && <BackendDownNotice />}
      {data?.hasBackend && accounts.length === 0 && (
        <Typography.Paragraph type="secondary">未添加邮箱账户，请在设置 → 邮件中添加并启用后再启动本地后端。</Typography.Paragraph>
      )}
      {data?.hasBackend && errors.length > 0 && (
        <Alert
          type="warning"
          message={`${errors.length} 个账户收取失败`}
          description={errors.map((e) => accountLabel(e.accountId) || e.accountId).join('、')}
        />
      )}
      {data?.hasBackend && !isLoading && accounts.length > 0 && visible.length === 0 && errors.length === 0 && (
        <Typography.Text type="secondary">没有需要关注的邮件。</Typography.Text>
      )}
      <List
        split
        dataSource={visible}
        renderItem={(m) => (
          <List.Item
            actions={[
              <Button key="dismiss" size="small" onClick={() => dismiss(m)}>
                已查看
              </Button>,
            ]}
          >
            <List.Item.Meta
              avatar={<Badge color={colorForAccount(m.sourceAccountId ?? '')} />}
              title={<Typography.Text ellipsis>{m.subject || '(无主题)'}</Typography.Text>}
              description={(
                <Flex vertical>
                  <Typography.Text type="secondary" ellipsis>{m.from}</Typography.Text>
                  <Typography.Text type="secondary" ellipsis>{m.snippet}</Typography.Text>
                </Flex>
              )}
            />
          </List.Item>
        )}
      />
    </Flex>
  );
}

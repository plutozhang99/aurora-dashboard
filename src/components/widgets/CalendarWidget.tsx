import { Alert, Badge, Divider, Flex, List, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { colorForAccount } from '@/lib/accountColors';
import { todayStr } from '@/lib/briefingTrigger';
import type { AppSettings, EmailAccount, AccountError } from '@/types';

interface ScheduleItem { id: string; time: string; title: string; source: string; sourceAccountId?: string }
interface ScheduleResponse { items: ScheduleItem[]; errors?: AccountError[] | null }

function enabledAccounts(settings: AppSettings): EmailAccount[] {
  return settings.emailAccounts.filter((a) => a.enabled);
}

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
    <Flex vertical className="widget-content">
      <WidgetHeader title="今日日程 · Today" right={today} />
      {isLoading && <Typography.Text type="secondary">加载中...</Typography.Text>}
      {data && !data.hasBackend && <BackendDownNotice />}
      {data?.hasBackend && errors.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${errors.length} 个账户收取失败`}
          description={errors.map((e) => accountLabel(e.accountId) || e.accountId).join('、')}
        />
      )}
      {data?.hasBackend && !isLoading && data.items.length === 0 && errors.length === 0 && (
        <Typography.Paragraph type="secondary">
          {accounts.length > 0
            ? '今天没有从邮件中识别的日程。'
            : '请在设置 -> 邮件中添加并启用账户，并启动本地后端以从邮件中提取日程。'}
        </Typography.Paragraph>
      )}
      <List
        split
        dataSource={data?.items ?? []}
        renderItem={(it) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Badge color={colorForAccount(it.sourceAccountId ?? '')} />}
              title={<Typography.Text>{it.time} · {it.title}</Typography.Text>}
              description={<Typography.Text type="secondary">{it.source}</Typography.Text>}
            />
          </List.Item>
        )}
      />
    </Flex>
  );
}

export function WidgetHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <>
      <Flex align="center" justify="space-between" gap={8}>
        <Typography.Text className="kicker">{title}</Typography.Text>
        {right !== undefined && (
          typeof right === 'string' || typeof right === 'number'
            ? <Tag>{right}</Tag>
            : right
        )}
      </Flex>
      <Divider className="widget-divider" />
    </>
  );
}

export function BackendDownNotice() {
  return (
    <Alert
      type="warning"
      showIcon
      message="本地后端未运行"
      description="邮件、日程与晨报都需要本地后端服务。运行 docker compose up 或 npm run dev 后重试。"
    />
  );
}

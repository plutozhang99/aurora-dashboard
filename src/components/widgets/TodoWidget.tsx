import { Badge, Button, Checkbox, Flex, Input, List, Space, Typography } from 'antd';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import {
  db,
  activeSuggestions,
  confirmSuggestion,
  ignoreSuggestion,
} from '@/lib/storage';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, EmailAccount, TodoItem, TodoSuggestion, AccountError } from '@/types';
import { WidgetHeader } from './CalendarWidget';

interface TodosResponse {
  suggestions: TodoSuggestion[];
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

export function TodoWidget() {
  const settings = useStore((s) => s.settings);
  const accounts = enabledAccounts(settings);

  const items = useLiveQuery(
    async () => db.todos.orderBy('createdAt').reverse().toArray(),
    [],
    [] as TodoItem[],
  );

  const dismissedRows = useLiveQuery(
    async () => db.suggestions.toArray(),
    [],
    [] as TodoSuggestion[],
  );

  const [input, setInput] = useState('');

  const { data: fetched } = useQuery({
    queryKey: ['email-todos', accountsKey(accounts)],
    queryFn: async (): Promise<TodoSuggestion[]> => {
      if (accounts.length === 0) return [];
      const has = await apiAvailable();
      if (!has) return [];
      const res = await api<TodosResponse>(`/email/todos`, {
        method: 'POST',
        body: JSON.stringify({
          accounts,
          mode: settings.emailImportanceMode,
          keywords: settings.emailImportanceKeywords,
          ai: settings.aiProvider !== 'none' && settings.aiApiKey
            ? { provider: settings.aiProvider, apiKey: settings.aiApiKey, model: settings.aiModel }
            : undefined,
          prompt: settings.prompts.emailTodo,
        }),
      }).catch(() => ({ suggestions: [] as TodoSuggestion[], errors: null }));
      return res.suggestions ?? [];
    },
    refetchInterval: 1000 * 60 * 10,
  });

  const dismissedIds = new Set((dismissedRows ?? []).filter((r) => r.dismissed).map((r) => r.id));
  const confirmedSourceIds = new Set(
    (items ?? []).map((t) => t.sourceEmailId).filter((id): id is string => !!id),
  );
  const suggestions = activeSuggestions(fetched ?? [], dismissedIds, confirmedSourceIds);

  async function add() {
    const t = input.trim();
    if (!t) return;
    await db.todos.put({ id: crypto.randomUUID(), text: t, done: false, createdAt: Date.now() });
    setInput('');
  }

  async function toggle(it: TodoItem) {
    await db.todos.put({ ...it, done: !it.done });
  }

  async function del(id: string) {
    await db.todos.delete(id);
  }

  const remaining = items?.filter((i) => !i.done).length ?? 0;

  return (
    <Flex vertical className="widget-content">
      <WidgetHeader title="待办 · To-do" right={`剩 ${remaining}`} />
      <Space.Compact className="full-width">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={add}
          placeholder="新增一项待办..."
        />
        <Button type="primary" onClick={add}>添加</Button>
      </Space.Compact>
      <List
        split
        dataSource={items ?? []}
        locale={{ emptyText: '还没有待办，添加一项开始吧。' }}
        renderItem={(it) => (
          <List.Item actions={[<Button key="delete" size="small" danger onClick={() => del(it.id)}>删除</Button>]}>
            <Flex align="center" gap={10} className="full-width">
              <Checkbox checked={it.done} onChange={() => toggle(it)} />
              <Typography.Text delete={it.done} type={it.done ? 'secondary' : undefined} ellipsis>
                {it.text}
              </Typography.Text>
              {it.sourceEmailId && <Badge color="blue" title={it.sourceSubject ? `来自邮件：${it.sourceSubject}` : '来自邮件'} />}
            </Flex>
          </List.Item>
        )}
      />

      {suggestions.length > 0 && (
        <>
          <WidgetHeader title="建议待办 · 来自邮件" right={suggestions.length} />
          <List
            split
            dataSource={suggestions}
            renderItem={(s) => (
              <List.Item
                actions={[
                  <Button key="confirm" size="small" type="primary" onClick={() => confirmSuggestion(s)}>确认</Button>,
                  <Button key="ignore" size="small" onClick={() => ignoreSuggestion(s)}>忽略</Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<Badge color={colorForAccount(s.sourceAccountId)} />}
                  title={s.text}
                  description={s.from}
                />
              </List.Item>
            )}
          />
        </>
      )}
    </Flex>
  );
}

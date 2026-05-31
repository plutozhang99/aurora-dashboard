import { Badge, Button, Checkbox, Flex, Input, List, Space, Typography } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activeSuggestions } from '@/lib/storage';
import {
  confirmSuggestionRemote,
  deleteTodo,
  ignoreSuggestionRemote,
  listDismissedSuggestions,
  listTodos,
  putTodo,
} from '@/lib/dataStore';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, EmailAccount, TodoItem, TodoSuggestion, AccountError } from '@/types';
import { BackendDownNotice, WidgetHeader } from './CalendarWidget';

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
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [showDone, setShowDone] = useState(false);

  const { data: todoData } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      const has = await apiAvailable();
      if (!has) return { items: [] as TodoItem[], hasBackend: false };
      return { items: await listTodos(), hasBackend: true };
    },
  });
  const items = todoData?.items ?? [];
  const hasBackend = todoData?.hasBackend ?? true;

  const { data: dismissedRows } = useQuery({
    queryKey: ['suggestions-dismissed'],
    queryFn: async (): Promise<TodoSuggestion[]> => {
      const has = await apiAvailable();
      if (!has) return [];
      return listDismissedSuggestions();
    },
  });

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

  const invalidateTodos = () => qc.invalidateQueries({ queryKey: ['todos'] });
  const addMut = useMutation({
    mutationFn: (text: string) =>
      putTodo({ id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }),
    onSuccess: invalidateTodos,
  });
  const toggleMut = useMutation({
    mutationFn: (it: TodoItem) => putTodo({ ...it, done: !it.done }),
    onSuccess: invalidateTodos,
  });
  const delMut = useMutation({ mutationFn: deleteTodo, onSuccess: invalidateTodos });
  // Confirming writes a todo whose sourceEmailId then hides the suggestion.
  const confirmMut = useMutation({ mutationFn: confirmSuggestionRemote, onSuccess: invalidateTodos });
  const ignoreMut = useMutation({
    mutationFn: ignoreSuggestionRemote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions-dismissed'] }),
  });

  const dismissedIds = new Set((dismissedRows ?? []).filter((r) => r.dismissed).map((r) => r.id));
  const confirmedSourceIds = new Set(
    items.map((t) => t.sourceEmailId).filter((id): id is string => !!id),
  );
  const suggestions = activeSuggestions(fetched ?? [], dismissedIds, confirmedSourceIds);

  function add() {
    const t = input.trim();
    if (!t) return;
    addMut.mutate(t);
    setInput('');
  }

  const incomplete = items.filter((i) => !i.done);
  const completed = items.filter((i) => i.done);

  const renderTodo = (it: TodoItem) => (
    <List.Item actions={[<Button key="delete" size="small" danger onClick={() => delMut.mutate(it.id)}>删除</Button>]}>
      <Flex align="center" gap={10} className="full-width">
        <Checkbox checked={it.done} onChange={() => toggleMut.mutate(it)} />
        <Typography.Text delete={it.done} type={it.done ? 'secondary' : undefined} ellipsis>
          {it.text}
        </Typography.Text>
        {it.sourceEmailId && <Badge color="blue" title={it.sourceSubject ? `来自邮件：${it.sourceSubject}` : '来自邮件'} />}
      </Flex>
    </List.Item>
  );

  return (
    <Flex vertical className="widget-content">
      <WidgetHeader title="待办 · To-do" right={`剩 ${incomplete.length}`} />
      {!hasBackend && <BackendDownNotice />}
      <Space.Compact className="full-width">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={add}
          placeholder="新增一项待办..."
          disabled={!hasBackend}
        />
        <Button type="primary" onClick={add} disabled={!hasBackend}>添加</Button>
      </Space.Compact>
      <List
        split
        dataSource={incomplete}
        locale={{ emptyText: hasBackend ? '还没有待办，添加一项开始吧。' : ' ' }}
        renderItem={renderTodo}
      />

      {completed.length > 0 && (
        <>
          <Button type="text" size="small" className="todo-toggle-done" onClick={() => setShowDone((v) => !v)}>
            {showDone ? '隐藏已完成' : `显示已完成 (${completed.length})`}
          </Button>
          {showDone && <List split dataSource={completed} renderItem={renderTodo} />}
        </>
      )}

      {suggestions.length > 0 && (
        <>
          <WidgetHeader title="建议待办 · 来自邮件" right={suggestions.length} />
          <List
            split
            dataSource={suggestions}
            renderItem={(s) => (
              <List.Item
                actions={[
                  <Button key="confirm" size="small" type="primary" onClick={() => confirmMut.mutate(s)}>确认</Button>,
                  <Button key="ignore" size="small" onClick={() => ignoreMut.mutate(s)}>忽略</Button>,
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

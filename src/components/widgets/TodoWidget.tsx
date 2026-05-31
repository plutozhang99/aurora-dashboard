import { Badge, Button, Checkbox, DatePicker, Flex, Input, List, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
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
import { aiPayload } from '@/lib/ai';
import { uid } from '@/lib/id';
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
  // Detail modal: the todo being viewed plus an editable draft of its fields.
  const [detail, setDetail] = useState<TodoItem | null>(null);
  const [draft, setDraft] = useState<{ text: string; note: string; due: Dayjs | null }>({
    text: '',
    note: '',
    due: null,
  });

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
          ai: aiPayload(settings),
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
      putTodo({ id: uid(), text, done: false, createdAt: Date.now() }),
    onSuccess: invalidateTodos,
  });
  const toggleMut = useMutation({
    mutationFn: (it: TodoItem) => putTodo({ ...it, done: !it.done }),
    onSuccess: invalidateTodos,
  });
  const delMut = useMutation({ mutationFn: deleteTodo, onSuccess: invalidateTodos });
  const saveMut = useMutation({
    mutationFn: (it: TodoItem) => putTodo(it),
    onSuccess: () => {
      invalidateTodos();
      setDetail(null);
    },
  });
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

  function openDetail(it: TodoItem) {
    setDetail(it);
    setDraft({
      text: it.text,
      note: it.note ?? '',
      due: it.dueDate ? dayjs(it.dueDate) : null,
    });
  }

  function saveDetail() {
    if (!detail) return;
    const text = draft.text.trim();
    if (!text) return;
    saveMut.mutate({
      ...detail,
      text,
      note: draft.note.trim() || undefined,
      dueDate: draft.due ? draft.due.format('YYYY-MM-DD') : undefined,
    });
  }

  const incomplete = items.filter((i) => !i.done);
  const completed = items.filter((i) => i.done);

  const renderTodo = (it: TodoItem) => (
    <List.Item
      className="todo-item"
      actions={[
        <Button
          key="delete"
          size="small"
          type="text"
          danger
          onClick={() => delMut.mutate(it.id)}
        >
          删除
        </Button>,
      ]}
    >
      <Checkbox checked={it.done} onChange={() => toggleMut.mutate(it)} />
      <button type="button" className="todo-open" onClick={() => openDetail(it)} title="查看 / 编辑详情">
        <Typography.Text delete={it.done} type={it.done ? 'secondary' : undefined} ellipsis>
          {it.text}
        </Typography.Text>
        {it.note && <Badge color="gold" title="有附加信息" />}
        {it.dueDate && <span className="todo-due">{it.dueDate}</span>}
        {it.sourceEmailId && <Badge color="blue" title={it.sourceSubject ? `来自邮件：${it.sourceSubject}` : '来自邮件'} />}
      </button>
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

      <Modal
        open={!!detail}
        title="待办详情"
        okText="保存"
        cancelText="关闭"
        onOk={saveDetail}
        onCancel={() => setDetail(null)}
        okButtonProps={{ disabled: !draft.text.trim(), loading: saveMut.isPending }}
        destroyOnHidden
      >
        {detail && (
          <Flex vertical gap={14} className="todo-detail">
            <label className="todo-field">
              <Typography.Text type="secondary">内容</Typography.Text>
              <Input.TextArea
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                autoSize={{ minRows: 1, maxRows: 4 }}
                placeholder="待办内容"
              />
            </label>
            <label className="todo-field">
              <Typography.Text type="secondary">截止日期</Typography.Text>
              <DatePicker
                value={draft.due}
                onChange={(d) => setDraft((prev) => ({ ...prev, due: d }))}
                className="full-width"
                placeholder="选择截止日期"
              />
            </label>
            <label className="todo-field">
              <Typography.Text type="secondary">附加信息 · 备注</Typography.Text>
              <Input.TextArea
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder="补充说明、链接、相关上下文……"
              />
            </label>
            <Flex gap={16} wrap>
              <Typography.Text type="secondary">
                创建于 {new Date(detail.createdAt).toLocaleString()}
              </Typography.Text>
              {detail.sourceSubject && (
                <Typography.Text type="secondary" ellipsis title={detail.sourceSubject}>
                  来自邮件：{detail.sourceSubject}
                </Typography.Text>
              )}
            </Flex>
          </Flex>
        )}
      </Modal>
    </Flex>
  );
}

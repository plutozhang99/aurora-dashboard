import { useEffect, useState } from 'react';
import { Eye, EyeOff, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import {
  Modal,
  Button,
  Tabs,
  TextField,
  Label,
  Input,
  TextArea,
  Select,
  ListBox,
  Switch,
  Card,
  CardContent,
  Chip,
  type Key,
} from '@heroui/react';
import { useStore, useUI } from '@/lib/store';
import { reverseGeocode } from '@/lib/weather';
import { WIDGET_CATALOG } from './widgets';
import { inferImapConfig } from '@/lib/imapConfig';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, WidgetInstance, PromptOverrides, EmailAccount } from '@/types';
import { DEFAULT_PROMPTS, DEFAULT_EMAIL_KEYWORDS, DEFAULT_SCHEDULE_KEYWORDS } from '@/types';

type TabKey =
  | 'general' | 'weather' | 'email' | 'briefing' | 'ai' | 'prompts' | 'news' | 'widgets';

const TAB_KEYS: TabKey[] = ['general', 'weather', 'email', 'briefing', 'ai', 'prompts', 'news', 'widgets'];

export function SettingsPanel() {
  const open = useUI((s) => s.settingsOpen);
  const setOpen = useUI((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const addWidget = useStore((s) => s.addWidget);
  const removeWidget = useStore((s) => s.removeWidget);
  const layout = useStore((s) => s.layout);

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [cityQuery, setCityQuery] = useState('');
  const [tab, setTab] = useState<TabKey>('general');

  useEffect(() => setDraft(settings), [settings]);

  function up<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft({ ...draft, [key]: value });
  }

  async function save() {
    await updateSettings(draft);
    setOpen(false);
  }

  async function lookupCity() {
    if (!cityQuery.trim()) return;
    const r = await reverseGeocode(cityQuery.trim());
    if (r) {
      setDraft({ ...draft, weatherLat: r.lat, weatherLon: r.lon, weatherCityLabel: r.name });
    }
  }

  const existingTypes = new Set(layout.widgets.map((w) => w.type));

  async function toggleWidget(type: WidgetInstance['type']) {
    const existing = layout.widgets.find((w) => w.type === type);
    if (existing) {
      await removeWidget(existing.id);
      return;
    }
    const wide = type === 'now' || type === 'news';
    await addWidget(
      { id: `w-${type}`, type },
      { i: `w-${type}`, x: 0, y: Infinity, w: wide ? 6 : 4, h: wide ? 4 : 5, minW: 4, minH: 3 },
    );
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-3xl w-full max-h-[88vh] flex flex-col bg-card">
          <Modal.Header>
            <Modal.Heading className="font-display text-[20px] tracking-tight text-ink">设置</Modal.Heading>
            <Modal.CloseTrigger />
          </Modal.Header>

          <Modal.Body className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden p-0">
            <Tabs
              variant="secondary"
              selectedKey={tab}
              onSelectionChange={(k) => setTab(k as TabKey)}
              className="flex-1 min-h-0 flex flex-col"
            >
              <Tabs.ListContainer className="px-5 border-b border-rule">
                <Tabs.List aria-label="设置分类" className="overflow-x-auto scroll-area">
                  {TAB_KEYS.map((t) => (
                    <Tabs.Tab key={t} id={t}>
                      <span className="kicker">{tabLabel(t)}</span>
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>

              <Tabs.Panel id="general" className="flex-1 min-h-0 overflow-auto scroll-area p-5 space-y-4">
                <TextField value={draft.serverUrl} onChange={(v) => up('serverUrl', v)}>
                  <Label className="kicker">本地后端 API 地址 (留空使用同源 /api)</Label>
                  <Input placeholder="http://127.0.0.1:5174/api" />
                </TextField>
                <TextField value={draft.accent} onChange={(v) => up('accent', v)}>
                  <Label className="kicker">主色调</Label>
                  <Input type="color" />
                </TextField>
                <SwitchRow
                  label="减弱动画 (省电模式)"
                  isSelected={draft.reduceMotion}
                  onChange={(v) => up('reduceMotion', v)}
                />
              </Tabs.Panel>

              <Tabs.Panel id="weather" className="flex-1 min-h-0 overflow-auto scroll-area p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="kicker">城市搜索</Label>
                  <div className="flex gap-2">
                    <TextField value={cityQuery} onChange={setCityQuery} className="flex-1">
                      <Input placeholder="如：杭州 / Tokyo" />
                    </TextField>
                    <Button variant="primary" onPress={lookupCity}>查询</Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="kicker">当前城市</Label>
                  <div className="text-sm text-ink-2">
                    {draft.weatherCityLabel}{' '}
                    <span className="num text-ink-3">
                      ({draft.weatherLat.toFixed(3)}, {draft.weatherLon.toFixed(3)})
                    </span>
                  </div>
                </div>
                <SimpleSelect
                  label="单位"
                  value={draft.weatherUnit}
                  onChange={(v) => up('weatherUnit', v as AppSettings['weatherUnit'])}
                  options={[
                    { id: 'metric', label: '公制 °C' },
                    { id: 'imperial', label: '英制 °F' },
                  ]}
                />
              </Tabs.Panel>

              <Tabs.Panel id="email" className="flex-1 min-h-0 overflow-auto scroll-area p-5">
                <EmailAccountsTab
                  accounts={draft.emailAccounts}
                  onChange={(accounts) => up('emailAccounts', accounts)}
                />
              </Tabs.Panel>

              <Tabs.Panel id="briefing" className="flex-1 min-h-0 overflow-auto scroll-area p-5 space-y-4">
                <div className="text-xs text-ink-3">
                  晨间播报会在清晨首次打开时自动生成一次（每天仅缓存一份），整合今日日程、重要邮件与新闻，并可朗读。
                </div>
                <TextField value={draft.morningTime} onChange={(v) => up('morningTime', v || '06:00')}>
                  <Label className="kicker">清晨自动生成时间 (HH:MM)</Label>
                  <Input type="time" />
                </TextField>
                <SimpleSelect
                  label="语音引擎"
                  value={draft.ttsEngine}
                  onChange={(v) => up('ttsEngine', v as AppSettings['ttsEngine'])}
                  options={[
                    { id: 'browser', label: '浏览器内置 (免费)' },
                    { id: 'cloud', label: '云端 TTS (敬请期待 · 暂未实现)' },
                  ]}
                />
                {draft.ttsEngine === 'cloud' && (
                  <div className="text-[11px] text-ember">云端 TTS 尚未实现，当前会回退到浏览器内置语音。</div>
                )}
              </Tabs.Panel>

              <Tabs.Panel id="ai" className="flex-1 min-h-0 overflow-auto scroll-area p-5 space-y-4">
                <SimpleSelect
                  label="Provider"
                  value={draft.aiProvider}
                  onChange={(v) => up('aiProvider', v as AppSettings['aiProvider'])}
                  options={[
                    { id: 'none', label: '未配置' },
                    { id: 'anthropic', label: 'Anthropic Claude' },
                    { id: 'openai', label: 'OpenAI' },
                  ]}
                />
                <TextField value={draft.aiApiKey} onChange={(v) => up('aiApiKey', v)}>
                  <Label className="kicker">API Key (本机存储)</Label>
                  <Input type="password" />
                </TextField>
                <TextField value={draft.aiModel} onChange={(v) => up('aiModel', v)}>
                  <Label className="kicker">模型</Label>
                  <Input placeholder="claude-sonnet-4-6 / gpt-4o-mini" />
                </TextField>
                <div className="text-xs text-ink-3">直连 provider 时如遇 CORS，可启动本地后端并设置「本地后端 API 地址」由后端转发。</div>
              </Tabs.Panel>

              <Tabs.Panel id="prompts" className="flex-1 min-h-0 overflow-auto scroll-area p-5">
                <PromptsTab draft={draft} up={up} />
              </Tabs.Panel>

              <Tabs.Panel id="news" className="flex-1 min-h-0 overflow-auto scroll-area p-5">
                <TextField
                  value={draft.newsFeeds.join('\n')}
                  onChange={(v) => up('newsFeeds', v.split('\n').map((s) => s.trim()).filter(Boolean))}
                >
                  <Label className="kicker">RSS 源 (每行一个)</Label>
                  <TextArea className="min-h-[160px] font-mono text-xs" />
                </TextField>
              </Tabs.Panel>

              <Tabs.Panel id="widgets" className="flex-1 min-h-0 overflow-auto scroll-area p-5 space-y-3">
                <div className="text-sm text-ink-2">
                  选择要显示的组件 — 每个组件只有一个；拖拽布局请用顶部「布局」按钮。
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {WIDGET_CATALOG.map((w) => {
                    const shown = existingTypes.has(w.type);
                    return (
                      <button
                        key={w.type}
                        type="button"
                        onClick={() => toggleWidget(w.type)}
                        className="text-left focus:outline-none"
                        aria-label={shown ? '点击隐藏' : '点击显示'}
                      >
                        <Card
                          className={
                            shown
                              ? 'bg-card border border-ember/40 shadow-card'
                              : 'bg-paper-2 border border-rule opacity-70 hover:opacity-100 transition-opacity'
                          }
                        >
                          <CardContent className="p-3 flex flex-col items-start gap-1">
                            <div className="flex items-center justify-between w-full">
                              <div className="text-2xl">{w.emoji}</div>
                              {shown
                                ? <Eye size={15} className="text-ember" />
                                : <EyeOff size={15} className="text-ink-4" />}
                            </div>
                            <div className="text-sm text-ink">{w.name}</div>
                            <div className={`kicker ${shown ? 'text-ember' : ''}`}>
                              {shown ? '已显示 · 点击隐藏' : '已隐藏 · 点击显示'}
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    );
                  })}
                </div>
              </Tabs.Panel>
            </Tabs>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onPress={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onPress={save}>保存</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function tabLabel(t: string) {
  return {
    general: '通用', weather: '天气', email: '邮件', briefing: '播报 / 语音',
    ai: 'AI', prompts: '提示词', news: '新闻', widgets: '组件',
  }[t] ?? t;
}

/* ───────────── shared building blocks ───────────── */

function SwitchRow({
  label,
  isSelected,
  onChange,
}: { label: string; isSelected: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="kicker">{label}</Label>
      <Switch isSelected={isSelected} onChange={onChange} />
    </div>
  );
}

function SimpleSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <Select
      value={value as Key}
      onChange={(k) => onChange(String(k))}
    >
      <Label className="kicker">{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/* ───────────── Email accounts ───────────── */

type AccountFormState = {
  id: string | null;
  label: string;
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  advancedOpen: boolean;
};

function emptyForm(): AccountFormState {
  return { id: null, label: '', user: '', password: '', host: '', port: 993, secure: true, advancedOpen: false };
}

function EmailAccountsTab({
  accounts,
  onChange,
}: {
  accounts: EmailAccount[];
  onChange: (accounts: EmailAccount[]) => void;
}) {
  const [form, setForm] = useState<AccountFormState | null>(null);

  function toggleEnabled(id: string) {
    onChange(accounts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }

  function remove(id: string) {
    onChange(accounts.filter((a) => a.id !== id));
    if (form?.id === id) setForm(null);
  }

  function startAdd() { setForm(emptyForm()); }

  function startEdit(a: EmailAccount) {
    setForm({
      id: a.id,
      label: a.label ?? '',
      user: a.user,
      password: '',
      host: a.host,
      port: a.port,
      secure: a.secure,
      advancedOpen: true,
    });
  }

  function onEmailChange(value: string) {
    if (!form) return;
    const next: AccountFormState = { ...form, user: value };
    if (form.id === null && !form.host) {
      const cfg = inferImapConfig(value);
      if (cfg.host) {
        next.host = cfg.host;
        next.port = cfg.port;
        next.secure = cfg.secure;
      }
    }
    setForm(next);
  }

  function saveForm() {
    if (!form) return;
    const user = form.user.trim();
    if (!user) return;
    const inferred = inferImapConfig(user);
    const host = form.host.trim() || inferred.host;
    if (form.id === null) {
      const acc: EmailAccount = {
        id: crypto.randomUUID(),
        label: form.label.trim() || undefined,
        enabled: true,
        host,
        port: form.port,
        user,
        password: form.password,
        secure: form.secure,
      };
      onChange([...accounts, acc]);
    } else {
      onChange(
        accounts.map((a) =>
          a.id === form.id
            ? {
                ...a,
                label: form.label.trim() || undefined,
                user,
                host,
                port: form.port,
                secure: form.secure,
                password: form.password ? form.password : a.password,
              }
            : a,
        ),
      );
    }
    setForm(null);
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-3">
        重要邮件、今日日程与晨报会跨所有「已启用」账户聚合。凭据仅保存在本机浏览器 IndexedDB，需运行本地后端。
      </div>

      <div className="space-y-2">
        {accounts.length === 0 && !form && (
          <div className="text-ink-3 text-sm">还没有邮箱账户 — 点下方「添加邮箱账户」。</div>
        )}
        {accounts.map((a) => (
          <Card key={a.id} className="bg-paper-2 border border-rule">
            <CardContent className="px-3 py-2 flex items-center gap-3 flex-row">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: colorForAccount(a.id) }}
                title={a.label ? `${a.label} (${a.user})` : a.user}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">
                  {a.label ? <span className="text-ink">{a.label}</span> : null}
                  <span className={a.label ? 'text-ink-3 ml-2' : 'text-ink'}>{a.user}</span>
                </div>
                <div className="num text-[11px] text-ink-3 truncate">
                  {a.host}:{a.port}{a.secure ? ' · TLS' : ''}
                </div>
              </div>
              <Switch isSelected={a.enabled} onChange={() => toggleEnabled(a.id)} />
              <Button isIconOnly size="sm" variant="tertiary" aria-label="编辑" onPress={() => startEdit(a)}>
                <Pencil size={14} />
              </Button>
              <Button isIconOnly size="sm" variant="tertiary" aria-label="删除" onPress={() => remove(a.id)}>
                <Trash2 size={14} />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!form && (
        <Button variant="primary" onPress={startAdd}>
          <PlusCircle size={14} /> 添加邮箱账户
        </Button>
      )}

      {form && (
        <Card className="bg-paper-2 border border-rule">
          <CardContent className="p-4 space-y-3">
            <div className="kicker">{form.id === null ? '添加邮箱账户 · New Account' : '编辑邮箱账户 · Edit Account'}</div>
            <TextField value={form.label} onChange={(v) => setForm({ ...form, label: v })}>
              <Label className="kicker">备注名 (可选，如「工作」)</Label>
              <Input placeholder="工作 / 个人" />
            </TextField>
            <TextField value={form.user} onChange={onEmailChange}>
              <Label className="kicker">邮箱地址</Label>
              <Input placeholder="you@example.com" />
            </TextField>
            <TextField value={form.password} onChange={(v) => setForm({ ...form, password: v })}>
              <Label className="kicker">
                {form.id === null ? '密码 / App Password (仅存本机)' : '密码 / App Password (留空则不修改)'}
              </Label>
              <Input type="password" placeholder={form.id === null ? '' : '••••••••'} />
            </TextField>
            <button
              type="button"
              className="text-xs text-ember hover:text-ember-deep hover:underline self-start"
              onClick={() => setForm({ ...form, advancedOpen: !form.advancedOpen })}
            >
              {form.advancedOpen ? '▾ 高级 (IMAP 主机/端口/SSL)' : '▸ 高级 (IMAP 主机/端口/SSL — 常见邮箱自动填)'}
            </button>
            {form.advancedOpen && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <TextField value={form.host} onChange={(v) => setForm({ ...form, host: v })}>
                    <Label className="kicker">主机</Label>
                    <Input placeholder="imap.example.com" />
                  </TextField>
                  <TextField
                    value={String(form.port)}
                    onChange={(v) => setForm({ ...form, port: Number(v) || 0 })}
                  >
                    <Label className="kicker">端口</Label>
                    <Input type="number" />
                  </TextField>
                </div>
                <SwitchRow
                  label="使用 TLS"
                  isSelected={form.secure}
                  onChange={(v) => setForm({ ...form, secure: v })}
                />
                {form.id === null && !form.host && (
                  <div className="text-[11px] text-ink-3">未识别的邮箱域名 — 请手动填写 IMAP 主机。</div>
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="secondary" onPress={() => setForm(null)}>取消</Button>
              <Button variant="primary" onPress={saveForm} isDisabled={!form.user.trim()}>保存账户</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-ink-3">
        Gmail 需启用「App password」(两步验证下生成)，<Chip size="sm" color="default" variant="soft" className="num">imap.gmail.com:993</Chip>。
      </div>
    </div>
  );
}

/* ───────────── Prompts ───────────── */

function PromptsTab({
  draft,
  up,
}: {
  draft: AppSettings;
  up: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  const prompts = draft.prompts;
  const setPrompts = (next: PromptOverrides) => up('prompts', next);
  const hasAi = draft.aiProvider !== 'none' && !!draft.aiApiKey;

  return (
    <div className="space-y-5">
      <div className="text-xs text-ink-3">
        每个 AI 相关功能都可以单独切换为 AI / 关键词模式，所有提示词与关键词都可以自定义并恢复默认。
        {!hasAi && ' 当前未配置 AI Provider — 切换到 AI 模式时会自动退回关键词。'}
      </div>

      <Section title="邮件 · 重要性判定">
        <ModeSwitch
          value={draft.emailImportanceMode}
          onChange={(v) => up('emailImportanceMode', v)}
          aiAvailable={hasAi}
        />
        {draft.emailImportanceMode === 'ai' ? (
          <PromptEditor
            value={prompts.emailImportance}
            defaultValue={DEFAULT_PROMPTS.emailImportance}
            onChange={(v) => setPrompts({ ...prompts, emailImportance: v })}
          />
        ) : (
          <KeywordEditor
            value={draft.emailImportanceKeywords}
            defaultValue={DEFAULT_EMAIL_KEYWORDS}
            onChange={(v) => up('emailImportanceKeywords', v)}
            hint="主题 / 正文 / 发件人 命中任意关键词即视为重要"
          />
        )}
      </Section>

      <Section title="日程 · 今日事件抽取">
        <ModeSwitch
          value={draft.scheduleMode}
          onChange={(v) => up('scheduleMode', v)}
          aiAvailable={hasAi}
        />
        {draft.scheduleMode === 'ai' ? (
          <PromptEditor
            value={prompts.scheduleExtract}
            defaultValue={DEFAULT_PROMPTS.scheduleExtract}
            onChange={(v) => setPrompts({ ...prompts, scheduleExtract: v })}
          />
        ) : (
          <KeywordEditor
            value={draft.scheduleHintKeywords}
            defaultValue={DEFAULT_SCHEDULE_KEYWORDS}
            onChange={(v) => up('scheduleHintKeywords', v)}
            hint="主题或正文命中任意关键词即视为候选日程；时间由内置正则推断"
          />
        )}
      </Section>

      <Section title="邮件 · 待办抽取">
        <div className="text-[11px] text-ink-3 mb-2">
          沿用「邮件 · 重要性判定」的 AI / 关键词模式与关键词；AI 模式下用下方提示词从邮件中提炼可执行待办。
        </div>
        <PromptEditor
          value={prompts.emailTodo}
          defaultValue={DEFAULT_PROMPTS.emailTodo}
          onChange={(v) => setPrompts({ ...prompts, emailTodo: v })}
        />
      </Section>

      <Section title="晨间播报 · 总结提示词">
        <div className="text-[11px] text-ink-3 mb-2">
          AI 模式下用于把今日日程 + 重要邮件 + 新闻整合成可朗读的口语化晨报；无 AI key 时后端降级为结构化拼接。
        </div>
        <PromptEditor
          value={prompts.briefingSummary}
          defaultValue={DEFAULT_PROMPTS.briefingSummary}
          onChange={(v) => setPrompts({ ...prompts, briefingSummary: v })}
        />
      </Section>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
  aiAvailable,
}: {
  value: 'ai' | 'keyword';
  onChange: (v: 'ai' | 'keyword') => void;
  aiAvailable: boolean;
}) {
  return (
    <Tabs
      variant="primary"
      selectedKey={value}
      onSelectionChange={(k) => onChange(k as 'ai' | 'keyword')}
      className="mb-2 w-fit"
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="模式">
          <Tabs.Tab id="ai">
            {`AI 判定${aiAvailable ? '' : ' (未配置)'}`}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="keyword">
            关键词匹配
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}

function KeywordEditor({
  value,
  defaultValue,
  onChange,
  hint,
}: {
  value: string[];
  defaultValue: string[];
  onChange: (v: string[]) => void;
  hint?: string;
}) {
  const text = value.join('\n');
  const isDefault =
    value.length === defaultValue.length && value.every((v, i) => v === defaultValue[i]);
  return (
    <div className="space-y-1">
      <TextField
        value={text}
        onChange={(v) => onChange(v.split('\n').map((s) => s.trim()).filter(Boolean))}
      >
        <TextArea
          className="min-h-[120px] font-mono text-xs leading-relaxed"
          placeholder={defaultValue.join('\n')}
        />
      </TextField>
      <div className="flex items-center justify-between text-[11px] text-ink-3">
        <span>{hint ?? '每行一个关键词，大小写不敏感'}</span>
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={isDefault}
          onPress={() => onChange([...defaultValue])}
        >
          恢复默认
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sec-head mb-3">
        <span className="kicker">{title}</span>
      </div>
      {children}
    </div>
  );
}

function PromptEditor({
  value,
  defaultValue,
  onChange,
}: {
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}) {
  const isDefault = value.trim() === defaultValue.trim() || value.trim() === '';
  return (
    <div className="space-y-1">
      <TextField value={value} onChange={onChange}>
        <TextArea
          className="min-h-[140px] font-mono text-xs leading-relaxed"
          placeholder={defaultValue}
        />
      </TextField>
      <div className="flex items-center justify-between text-[11px] text-ink-3">
        <span>{isDefault ? '使用默认提示词' : '已自定义'}</span>
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={isDefault}
          onPress={() => onChange(defaultValue)}
        >
          恢复默认
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useStore, useUI } from '@/lib/store';
import { reverseGeocode, locateCurrentCity, isGeoPermissionDenied, GEO_ATTEMPTED_KEY } from '@/lib/weather';
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
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
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
    if (r) setDraft({ ...draft, weatherLat: r.lat, weatherLon: r.lon, weatherCityLabel: r.name });
  }

  async function useCurrentLocation() {
    setLocating(true);
    setGeoError(null);
    try {
      const loc = await locateCurrentCity();
      localStorage.setItem(GEO_ATTEMPTED_KEY, '1');
      setDraft({ ...draft, weatherLat: loc.lat, weatherLon: loc.lon, weatherCityLabel: loc.name });
    } catch (err) {
      setGeoError(
        isGeoPermissionDenied(err)
          ? '定位权限被拒绝，请在浏览器站点权限中允许位置访问，或手动搜索城市。'
          : '定位失败，可能超时或需要 HTTPS 环境。可稍后重试或手动搜索城市。',
      );
    } finally {
      setLocating(false);
    }
  }

  const existingTypes = new Set(layout.widgets.map((w) => w.type));

  async function toggleWidget(type: WidgetInstance['type']) {
    const existing = layout.widgets.find((w) => w.type === type);
    if (existing) {
      await removeWidget(existing.id);
      return;
    }
    await addWidget({ id: `w-${type}`, type }, { i: `w-${type}`, x: 0, y: Infinity, w: 4, h: 4, minW: 4, minH: 3 });
  }

  const items = TAB_KEYS.map((key) => ({
    key,
    label: tabLabel(key),
    children: (
      <div className="settings-tab">
        {key === 'general' && (
          <Space direction="vertical" size={16} className="full-width">
            <Form.Item label="本地后端 API 地址">
              <Input value={draft.serverUrl} onChange={(e) => up('serverUrl', e.target.value)} placeholder="http://127.0.0.1:5174/api" />
            </Form.Item>
            <SwitchRow label="减弱动画 (省电模式)" checked={draft.reduceMotion} onChange={(v) => up('reduceMotion', v)} />
          </Space>
        )}

        {key === 'weather' && (
          <Space direction="vertical" size={16} className="full-width">
            <Form.Item label="城市搜索">
              <Space.Compact className="full-width">
                <Input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="如：杭州 / Tokyo" />
                <Button type="primary" onClick={lookupCity}>查询</Button>
              </Space.Compact>
            </Form.Item>
            <Flex align="center" justify="space-between" gap={12}>
              <Typography.Text>
                {draft.weatherCityLabel} <Typography.Text type="secondary" className="num">({draft.weatherLat.toFixed(3)}, {draft.weatherLon.toFixed(3)})</Typography.Text>
              </Typography.Text>
              <Button onClick={useCurrentLocation} loading={locating}>定位当前位置</Button>
            </Flex>
            {geoError && <Alert type="warning" message={geoError} />}
            <Form.Item label="单位">
              <Select
                value={draft.weatherUnit}
                onChange={(v) => up('weatherUnit', v)}
                options={[
                  { value: 'metric', label: '公制 °C' },
                  { value: 'imperial', label: '英制 °F' },
                ]}
              />
            </Form.Item>
          </Space>
        )}

        {key === 'email' && (
          <EmailAccountsTab accounts={draft.emailAccounts} onChange={(accounts) => up('emailAccounts', accounts)} />
        )}

        {key === 'briefing' && (
          <Space direction="vertical" size={16} className="full-width">
            <Typography.Text type="secondary">晨间播报会在清晨首次打开时自动生成一次，整合今日日程、重要邮件与新闻，并可朗读。</Typography.Text>
            <Form.Item label="清晨自动生成时间">
              <Input type="time" value={draft.morningTime} onChange={(e) => up('morningTime', e.target.value || '06:00')} />
            </Form.Item>
            <Form.Item label="语音引擎">
              <Select
                value={draft.ttsEngine}
                onChange={(v) => up('ttsEngine', v)}
                options={[
                  { value: 'browser', label: '浏览器内置 (免费)' },
                  { value: 'cloud', label: '云端 TTS (暂未实现)' },
                ]}
              />
            </Form.Item>
            {draft.ttsEngine === 'cloud' && <Alert type="warning" message="云端 TTS 尚未实现，当前会回退到浏览器内置语音。" />}
          </Space>
        )}

        {key === 'ai' && (
          <Space direction="vertical" size={16} className="full-width">
            <Form.Item label="Provider">
              <Select
                value={draft.aiProvider}
                onChange={(v) => up('aiProvider', v)}
                options={[
                  { value: 'none', label: '未配置' },
                  { value: 'anthropic', label: 'Anthropic Claude' },
                  { value: 'openai', label: 'OpenAI' },
                ]}
              />
            </Form.Item>
            <Form.Item label="API Key (本机存储)">
              <Input.Password value={draft.aiApiKey} onChange={(e) => up('aiApiKey', e.target.value)} />
            </Form.Item>
            <Form.Item label="模型">
              <Input value={draft.aiModel} onChange={(e) => up('aiModel', e.target.value)} placeholder="claude-sonnet-4-6 / gpt-4o-mini" />
            </Form.Item>
            <Typography.Text type="secondary">直连 provider 时如遇 CORS，可启动本地后端并设置本地后端 API 地址由后端转发。</Typography.Text>
          </Space>
        )}

        {key === 'prompts' && <PromptsTab draft={draft} up={up} />}

        {key === 'news' && (
          <LineListField value={draft.newsFeeds} onChange={(v) => up('newsFeeds', v)} placeholder="RSS 源，每行一个" minRows={7} />
        )}

        {key === 'widgets' && (
          <Flex vertical gap={12}>
            <Typography.Text type="secondary">选择要显示的组件，每个组件只有一个。Masonry 排布会自动按高度分列。</Typography.Text>
            <Flex gap={12} wrap="wrap">
              {WIDGET_CATALOG.map((w) => {
                const shown = existingTypes.has(w.type);
                return (
                  <Card key={w.type} className="widget-toggle-card">
                    <Flex vertical gap={8}>
                      <Flex justify="space-between" align="center">
                        <Typography.Text>{w.emoji} {w.name}</Typography.Text>
                        <Tag color={shown ? 'success' : 'default'}>{shown ? '已显示' : '已隐藏'}</Tag>
                      </Flex>
                      <Button type={shown ? 'default' : 'primary'} onClick={() => toggleWidget(w.type)}>
                        {shown ? '隐藏' : '显示'}
                      </Button>
                    </Flex>
                  </Card>
                );
              })}
            </Flex>
          </Flex>
        )}
      </div>
    ),
  }));

  return (
    <Modal
      title="设置"
      open={open}
      onCancel={() => setOpen(false)}
      onOk={save}
      okText="保存"
      cancelText="取消"
      width={860}
      styles={{ body: { maxHeight: '68vh', overflow: 'auto' } }}
    >
      <Tabs activeKey={tab} onChange={(k) => setTab(k as TabKey)} items={items} />
    </Modal>
  );
}

function tabLabel(t: string) {
  return {
    general: '通用', weather: '天气', email: '邮件', briefing: '播报 / 语音',
    ai: 'AI', prompts: '提示词', news: '新闻', widgets: '组件',
  }[t] ?? t;
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Flex align="center" justify="space-between" gap={12}>
      <Typography.Text>{label}</Typography.Text>
      <Switch checked={checked} onChange={onChange} />
    </Flex>
  );
}

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

function EmailAccountsTab({ accounts, onChange }: { accounts: EmailAccount[]; onChange: (accounts: EmailAccount[]) => void }) {
  const [form, setForm] = useState<AccountFormState | null>(null);

  function toggleEnabled(id: string) {
    onChange(accounts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }

  function remove(id: string) {
    onChange(accounts.filter((a) => a.id !== id));
    if (form?.id === id) setForm(null);
  }

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
      onChange([...accounts, {
        id: crypto.randomUUID(),
        label: form.label.trim() || undefined,
        enabled: true,
        host,
        port: form.port,
        user,
        password: form.password,
        secure: form.secure,
      }]);
    } else {
      onChange(accounts.map((a) => a.id === form.id ? {
        ...a,
        label: form.label.trim() || undefined,
        user,
        host,
        port: form.port,
        secure: form.secure,
        password: form.password ? form.password : a.password,
      } : a));
    }
    setForm(null);
  }

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Typography.Text type="secondary">重要邮件、今日日程与晨报会跨所有已启用账户聚合。凭据仅保存在本机浏览器 IndexedDB。</Typography.Text>
      {accounts.length === 0 && !form && <Alert type="info" message="还没有邮箱账户。" />}
      {accounts.map((a) => (
        <Card key={a.id}>
          <Flex align="center" gap={12} wrap="wrap">
            <Tag color={colorForAccount(a.id)}>{a.label || a.user}</Tag>
            <Typography.Text ellipsis className="account-mail">{a.user}</Typography.Text>
            <Typography.Text type="secondary" className="num">{a.host}:{a.port}{a.secure ? ' · TLS' : ''}</Typography.Text>
            <Switch checked={a.enabled} onChange={() => toggleEnabled(a.id)} />
            <Button onClick={() => startEdit(a)}>编辑</Button>
            <Button danger onClick={() => remove(a.id)}>删除</Button>
          </Flex>
        </Card>
      ))}

      {!form && <Button type="primary" onClick={() => setForm(emptyForm())}>添加邮箱账户</Button>}

      {form && (
        <Card>
          <Space direction="vertical" size={12} className="full-width">
            <Typography.Text className="kicker">{form.id === null ? '添加邮箱账户 · New Account' : '编辑邮箱账户 · Edit Account'}</Typography.Text>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="备注名，如 工作 / 个人" />
            <Input value={form.user} onChange={(e) => onEmailChange(e.target.value)} placeholder="you@example.com" />
            <Input.Password value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id === null ? '密码 / App Password' : '留空则不修改密码'} />
            <Button onClick={() => setForm({ ...form, advancedOpen: !form.advancedOpen })}>
              {form.advancedOpen ? '收起高级设置' : '展开高级设置'}
            </Button>
            {form.advancedOpen && (
              <Flex gap={12} wrap="wrap">
                <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="imap.example.com" />
                <InputNumber value={form.port} min={1} max={65535} onChange={(v) => setForm({ ...form, port: Number(v) || 0 })} />
                <SwitchRow label="使用 TLS" checked={form.secure} onChange={(v) => setForm({ ...form, secure: v })} />
              </Flex>
            )}
            <Flex justify="flex-end" gap={8}>
              <Button onClick={() => setForm(null)}>取消</Button>
              <Button type="primary" onClick={saveForm} disabled={!form.user.trim()}>保存账户</Button>
            </Flex>
          </Space>
        </Card>
      )}

      <Typography.Text type="secondary">
        Gmail 需启用 App password，<Tag className="num">imap.gmail.com:993</Tag>
      </Typography.Text>
    </Space>
  );
}

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
    <Space direction="vertical" size={18} className="full-width">
      <Alert type="info" message={`每个 AI 相关功能都可以单独切换为 AI / 关键词模式。${hasAi ? '' : '当前未配置 AI Provider，AI 模式会自动退回关键词。'}`} />
      <PromptSection title="邮件 · 重要性判定">
        <ModeSwitch value={draft.emailImportanceMode} onChange={(v) => up('emailImportanceMode', v)} aiAvailable={hasAi} />
        {draft.emailImportanceMode === 'ai' ? (
          <PromptEditor value={prompts.emailImportance} defaultValue={DEFAULT_PROMPTS.emailImportance} onChange={(v) => setPrompts({ ...prompts, emailImportance: v })} />
        ) : (
          <KeywordEditor value={draft.emailImportanceKeywords} defaultValue={DEFAULT_EMAIL_KEYWORDS} onChange={(v) => up('emailImportanceKeywords', v)} />
        )}
      </PromptSection>
      <PromptSection title="日程 · 今日事件抽取">
        <ModeSwitch value={draft.scheduleMode} onChange={(v) => up('scheduleMode', v)} aiAvailable={hasAi} />
        {draft.scheduleMode === 'ai' ? (
          <PromptEditor value={prompts.scheduleExtract} defaultValue={DEFAULT_PROMPTS.scheduleExtract} onChange={(v) => setPrompts({ ...prompts, scheduleExtract: v })} />
        ) : (
          <KeywordEditor value={draft.scheduleHintKeywords} defaultValue={DEFAULT_SCHEDULE_KEYWORDS} onChange={(v) => up('scheduleHintKeywords', v)} />
        )}
      </PromptSection>
      <PromptSection title="邮件 · 待办抽取">
        <PromptEditor value={prompts.emailTodo} defaultValue={DEFAULT_PROMPTS.emailTodo} onChange={(v) => setPrompts({ ...prompts, emailTodo: v })} />
      </PromptSection>
      <PromptSection title="晨间播报 · 总结提示词">
        <PromptEditor value={prompts.briefingSummary} defaultValue={DEFAULT_PROMPTS.briefingSummary} onChange={(v) => setPrompts({ ...prompts, briefingSummary: v })} />
      </PromptSection>
    </Space>
  );
}

function ModeSwitch({ value, onChange, aiAvailable }: { value: 'ai' | 'keyword'; onChange: (v: 'ai' | 'keyword') => void; aiAvailable: boolean }) {
  return (
    <Segmented
      value={value}
      onChange={(v) => onChange(v as 'ai' | 'keyword')}
      options={[
        { value: 'ai', label: `AI 判定${aiAvailable ? '' : ' (未配置)'}` },
        { value: 'keyword', label: '关键词匹配' },
      ]}
    />
  );
}

const parseLines = (v: string): string[] => v.split('\n').map((s) => s.trim()).filter(Boolean);

function LineListField({ value, onChange, placeholder, minRows = 5 }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; minRows?: number }) {
  const [text, setText] = useState(() => value.join('\n'));

  useEffect(() => {
    if (parseLines(text).join('\n') !== value.join('\n')) setText(value.join('\n'));
  }, [text, value]);

  return (
    <Input.TextArea
      value={text}
      autoSize={{ minRows }}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseLines(e.target.value));
      }}
    />
  );
}

function KeywordEditor({ value, defaultValue, onChange }: { value: string[]; defaultValue: string[]; onChange: (v: string[]) => void }) {
  const isDefault = value.length === defaultValue.length && value.every((v, i) => v === defaultValue[i]);
  return (
    <Space direction="vertical" className="full-width">
      <LineListField value={value} onChange={onChange} placeholder={defaultValue.join('\n')} />
      <Flex justify="space-between" align="center">
        <Typography.Text type="secondary">每行一个关键词，大小写不敏感。</Typography.Text>
        <Button disabled={isDefault} onClick={() => onChange([...defaultValue])}>恢复默认</Button>
      </Flex>
    </Space>
  );
}

function PromptSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card title={<Typography.Text className="kicker">{title}</Typography.Text>}>
      <Space direction="vertical" size={12} className="full-width">{children}</Space>
    </Card>
  );
}

function PromptEditor({ value, defaultValue, onChange }: { value: string; defaultValue: string; onChange: (v: string) => void }) {
  const isDefault = value.trim() === defaultValue.trim() || value.trim() === '';
  return (
    <Space direction="vertical" className="full-width">
      <Input.TextArea value={value} autoSize={{ minRows: 7 }} placeholder={defaultValue} onChange={(e) => onChange(e.target.value)} />
      <Flex justify="space-between" align="center">
        <Typography.Text type="secondary">{isDefault ? '使用默认提示词' : '已自定义'}</Typography.Text>
        <Button disabled={isDefault} onClick={() => onChange(defaultValue)}>恢复默认</Button>
      </Flex>
    </Space>
  );
}

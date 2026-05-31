import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
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
import { uid } from '@/lib/id';
import { api } from '@/lib/api';
import { clearCache, factoryReset } from '@/lib/maintenance';
import { AI_MODELS, DEFAULT_MODEL_FOR, modelOptions } from '@/lib/aiModels';
import type { AppSettings, WidgetInstance, PromptOverrides, EmailAccount } from '@/types';
import { DEFAULT_PROMPTS, DEFAULT_EMAIL_KEYWORDS, DEFAULT_SCHEDULE_KEYWORDS } from '@/types';
import { aiConfigured } from '@/lib/ai';

type TabKey =
  | 'general' | 'weather' | 'email' | 'briefing' | 'ai' | 'prompts' | 'news' | 'widgets';

const TAB_KEYS: TabKey[] = ['general', 'weather', 'email', 'briefing', 'ai', 'prompts', 'news', 'widgets'];

// Per-provider hints for the AI tab. Keyed by AppSettings['aiProvider'].
const AI_PROVIDER_HINT: Record<string, string> = {
  deepseek: 'DeepSeek 兼容 OpenAI 接口，默认走 https://api.deepseek.com，在官网控制台申请 Key。',
  ollama: 'Ollama 在本机/局域网运行、无需 Key：先 `ollama serve` 并 `ollama pull` 上面的模型，确保后端能访问其地址即可。',
  default: '直连 provider 时如遇 CORS，可启动本地后端并设置本地后端 API 地址由后端转发。',
};

// edge-tts 中文神经音色（云端引擎）。需本地后端运行且能联网到微软 TTS。
const TTS_VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 女声（自然）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 · 女声（亲切）' },
  { value: 'zh-CN-YunxiNeural', label: '云希 · 男声（沉稳）' },
  { value: 'zh-CN-YunjianNeural', label: '云健 · 男声（浑厚）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 · 男声（播音）' },
];

export function SettingsPanel() {
  const { message } = AntdApp.useApp();
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

  // Functional update so two `up` calls in one handler (e.g. provider + model)
  // don't clobber each other via a stale `draft` closure.
  function up<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    try {
      await updateSettings(draft);
      message.success('设置已保存');
      setOpen(false);
    } catch {
      message.error('保存失败，请重试');
    }
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
            <Form.Item label="主题">
              <Segmented
                value={draft.theme}
                onChange={(v) => up('theme', v as AppSettings['theme'])}
                options={[
                  { value: 'system', label: '跟随系统' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ]}
              />
            </Form.Item>
            <SwitchRow label="减弱动画 (省电模式)" checked={draft.reduceMotion} onChange={(v) => up('reduceMotion', v)} />
            <Form.Item label="本地数据" help="只影响本机浏览器存储；后端的待办/便签不受影响。">
              <Flex gap={12} wrap="wrap">
                <Popconfirm
                  title="清除缓存"
                  description="清掉晨报缓存与定位标记并重载；设置、邮箱、布局保留。"
                  okText="清除"
                  cancelText="取消"
                  onConfirm={() => clearCache()}
                >
                  <Button>清除缓存</Button>
                </Popconfirm>
                <Popconfirm
                  title="恢复出厂设置"
                  description="清空本机全部本地数据（设置、邮箱账户、AI Key、布局、缓存）并重载，不可撤销。"
                  okText="恢复出厂"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => factoryReset()}
                >
                  <Button danger>恢复出厂设置</Button>
                </Popconfirm>
              </Flex>
            </Form.Item>
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
                  { value: 'browser', label: '浏览器内置 (免费, 离线)' },
                  { value: 'cloud', label: '云端 edge-tts (免费, 音质更好)' },
                ]}
              />
            </Form.Item>
            {draft.ttsEngine === 'cloud' && (
              <>
                <Form.Item label="云端音色">
                  <Select
                    value={draft.ttsVoice}
                    onChange={(v) => up('ttsVoice', v)}
                    options={TTS_VOICES}
                  />
                </Form.Item>
                <Alert
                  type="info"
                  message="云端 edge-tts 由本地后端调用微软免费 TTS，无需 API Key，但需后端运行且能联网；联网失败时自动回退到浏览器内置语音。"
                />
              </>
            )}
          </Space>
        )}

        {key === 'ai' && (
          <Space direction="vertical" size={16} className="full-width">
            <Form.Item label="Provider">
              <Select
                value={draft.aiProvider}
                onChange={(v) =>
                  setDraft((d) => {
                    const fits = (AI_MODELS[v] ?? []).some((o) => o.value === d.aiModel);
                    return {
                      ...d,
                      aiProvider: v as AppSettings['aiProvider'],
                      aiModel: fits ? d.aiModel : DEFAULT_MODEL_FOR[v] ?? d.aiModel,
                    };
                  })
                }
                options={[
                  { value: 'none', label: '未配置' },
                  { value: 'anthropic', label: 'Anthropic Claude' },
                  { value: 'openai', label: 'OpenAI' },
                  { value: 'deepseek', label: 'DeepSeek' },
                  { value: 'ollama', label: 'Ollama（本地，无需 Key）' },
                ]}
              />
            </Form.Item>
            {draft.aiProvider !== 'ollama' && (
              <Form.Item label="API Key (本机存储)">
                <Input.Password value={draft.aiApiKey} onChange={(e) => up('aiApiKey', e.target.value)} />
              </Form.Item>
            )}
            <AiModelField draft={draft} up={up} />
            {draft.aiProvider === 'ollama' && (
              <Form.Item label="Ollama 地址" help="留空用默认 http://localhost:11434/v1；远程主机填 http://IP:11434/v1。后端需能访问该地址。">
                <Input value={draft.aiBaseUrl} onChange={(e) => up('aiBaseUrl', e.target.value)} placeholder="http://localhost:11434/v1" />
              </Form.Item>
            )}
            <Typography.Text type="secondary">{AI_PROVIDER_HINT[draft.aiProvider] ?? AI_PROVIDER_HINT.default}</Typography.Text>
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
  const { message } = AntdApp.useApp();
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
        id: uid(),
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
    message.success(form.id === null ? '账户已添加，点底部「保存」后生效' : '账户已更新，点底部「保存」后生效');
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

/**
 * Model picker that pulls the *live* model list from the provider's API (via the
 * backend `/api/models`) on demand, falling back to the curated {@link AI_MODELS}
 * list when no backend/key is available. A plain dropdown — no manual typing.
 */
function AiModelField({
  draft,
  up,
}: {
  draft: AppSettings;
  up: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  const provider = draft.aiProvider;
  const [fetched, setFetched] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drop a stale live list when the provider changes.
  useEffect(() => {
    setFetched(null);
    setError(null);
  }, [provider]);

  async function pull() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ models: { id: string; label?: string }[] }>('/models', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          apiKey: draft.aiApiKey,
          model: draft.aiModel,
          baseUrl: draft.aiBaseUrl || undefined,
        }),
      });
      const ids = res.models.map((m) => m.id);
      setFetched(ids);
      if (ids.length && !ids.includes(draft.aiModel)) up('aiModel', ids[0]);
    } catch {
      setError('拉取失败：需本地后端运行，且 Key / 网络 / 地址正确。可继续用内置列表。');
    } finally {
      setLoading(false);
    }
  }

  if (provider === 'none') return null;

  const baseIds = (AI_MODELS[provider] ?? []).map((o) => o.value);
  const options = modelOptions(provider, fetched ?? baseIds, draft.aiModel);

  return (
    <Form.Item
      label="模型"
      help={
        provider === 'ollama'
          ? '点「拉取最新」列出本机 Ollama 已 pull 的模型。'
          : '点「拉取最新」从 Provider API 拉取可用模型；否则用内置列表。'
      }
    >
      <Space direction="vertical" size={8} className="full-width">
        <Space.Compact className="full-width">
          <Select
            showSearch
            className="full-width"
            value={draft.aiModel || undefined}
            placeholder="选择模型"
            onChange={(v) => up('aiModel', v)}
            options={options}
          />
          <Button onClick={pull} loading={loading}>拉取最新</Button>
        </Space.Compact>
        {error && <Alert type="warning" message={error} />}
        {fetched && !error && (
          <Typography.Text type="secondary">已从 API 拉取 {fetched.length} 个模型。</Typography.Text>
        )}
      </Space>
    </Form.Item>
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
  const hasAi = aiConfigured(draft);

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

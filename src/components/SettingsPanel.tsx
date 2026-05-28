import { useEffect, useState } from 'react';
import { X, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { useStore, useUI } from '@/lib/store';
import { reverseGeocode } from '@/lib/weather';
import { WIDGET_CATALOG } from './widgets';
import { inferImapConfig } from '@/lib/imapConfig';
import { colorForAccount } from '@/lib/accountColors';
import type { AppSettings, WidgetInstance, PromptOverrides, EmailAccount } from '@/types';
import { DEFAULT_PROMPTS, DEFAULT_EMAIL_KEYWORDS, DEFAULT_SCHEDULE_KEYWORDS } from '@/types';

export function SettingsPanel() {
  const setOpen = useUI((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const addWidget = useStore((s) => s.addWidget);
  const layout = useStore((s) => s.layout);

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [cityQuery, setCityQuery] = useState('');
  const [tab, setTab] = useState<'general' | 'weather' | 'email' | 'briefing' | 'ai' | 'prompts' | 'news' | 'widgets'>('general');

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

  async function add(type: WidgetInstance['type']) {
    const id = `w-${type}-${Math.random().toString(36).slice(2, 6)}`;
    await addWidget({ id, type }, { i: id, x: 0, y: Infinity, w: 4, h: 4, minW: 3, minH: 3 });
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm grid place-items-center p-4 overflow-auto">
      <div className="glass rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="text-lg font-display font-semibold">设置</div>
          <button className="text-white/60 hover:text-white" onClick={() => setOpen(false)}><X /></button>
        </div>
        <div className="shrink-0 flex gap-2 px-5 py-3 mb-1 border-b border-white/10 text-sm overflow-x-auto scrollbar-thin">
          {(['general','weather','email','briefing','ai','prompts','news','widgets'] as const).map((t) => (
            <button
              key={t}
              className={`shrink-0 px-3 py-1 rounded-lg focus:outline-none transition ${
                tab === t ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              onClick={() => setTab(t)}
            >{tabLabel(t)}</button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4 scroll-area">
          {tab === 'general' && (
            <>
              <Field label="本地后端 API 地址 (留空使用同源 /api)">
                <input className="input" value={draft.serverUrl} onChange={(e) => up('serverUrl', e.target.value)} placeholder="http://127.0.0.1:5174/api" />
              </Field>
              <Field label="主色调">
                <input className="input" type="color" value={draft.accent} onChange={(e) => up('accent', e.target.value)} />
              </Field>
              <Field label="减弱动画 (省电模式)">
                <Toggle value={draft.reduceMotion} onChange={(v) => up('reduceMotion', v)} />
              </Field>
            </>
          )}
          {tab === 'weather' && (
            <>
              <Field label="城市搜索">
                <div className="flex gap-2">
                  <input className="input" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="如：杭州 / Tokyo" />
                  <button className="btn btn-primary" onClick={lookupCity}>查询</button>
                </div>
              </Field>
              <Field label="当前城市">
                <div className="text-sm text-white/80">{draft.weatherCityLabel} ({draft.weatherLat.toFixed(3)}, {draft.weatherLon.toFixed(3)})</div>
              </Field>
              <Field label="单位">
                <select className="input" value={draft.weatherUnit} onChange={(e) => up('weatherUnit', e.target.value as any)}>
                  <option value="metric">公制 °C</option>
                  <option value="imperial">英制 °F</option>
                </select>
              </Field>
            </>
          )}
          {tab === 'email' && (
            <EmailAccountsTab
              accounts={draft.emailAccounts}
              onChange={(accounts) => up('emailAccounts', accounts)}
            />
          )}
          {tab === 'briefing' && (
            <>
              <div className="text-xs text-white/50">
                晨间播报会在清晨首次打开时自动生成一次（每天仅缓存一份），整合今日日程、重要邮件与新闻，并可朗读。
              </div>
              <Field label="清晨自动生成时间 (HH:MM)">
                <input
                  className="input"
                  type="time"
                  value={draft.morningTime}
                  onChange={(e) => up('morningTime', e.target.value || '06:00')}
                />
              </Field>
              <Field label="语音引擎">
                <select
                  className="input"
                  value={draft.ttsEngine}
                  onChange={(e) => up('ttsEngine', e.target.value as AppSettings['ttsEngine'])}
                >
                  <option value="browser">浏览器内置 (免费)</option>
                  <option value="cloud">云端 TTS (敬请期待 · 暂未实现)</option>
                </select>
              </Field>
              {draft.ttsEngine === 'cloud' && (
                <div className="text-[11px] text-amber-200/70">云端 TTS 尚未实现，当前会回退到浏览器内置语音。</div>
              )}
            </>
          )}
          {tab === 'ai' && (
            <>
              <Field label="Provider">
                <select className="input" value={draft.aiProvider} onChange={(e) => up('aiProvider', e.target.value as any)}>
                  <option value="none">未配置</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                </select>
              </Field>
              <Field label="API Key (本机存储)">
                <input className="input" type="password" value={draft.aiApiKey} onChange={(e) => up('aiApiKey', e.target.value)} />
              </Field>
              <Field label="模型">
                <input className="input" value={draft.aiModel} onChange={(e) => up('aiModel', e.target.value)} placeholder="claude-sonnet-4-6 / gpt-4o-mini" />
              </Field>
              <div className="text-xs text-white/40">直连 provider 时如遇 CORS，可启动本地后端并设置「本地后端 API 地址」由后端转发。</div>
            </>
          )}
          {tab === 'prompts' && (
            <PromptsTab
              draft={draft}
              up={up}
            />
          )}
          {tab === 'news' && (
            <FieldList
              label="RSS 源 (每行一个)"
              value={draft.newsFeeds.join('\n')}
              onChange={(v) => up('newsFeeds', v.split('\n').map((s) => s.trim()).filter(Boolean))}
            />
          )}
          {tab === 'widgets' && (
            <>
              <div className="text-sm text-white/70">添加组件 — 拖拽布局请使用顶部「布局」按钮</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {WIDGET_CATALOG.map((w) => (
                  <button
                    key={w.type}
                    className="glass glass-hover rounded-xl p-3 flex flex-col items-start gap-1 text-left"
                    onClick={() => add(w.type)}
                  >
                    <div className="text-2xl">{w.emoji}</div>
                    <div className="text-sm">{w.name}</div>
                    <div className="text-[10px] text-white/40">
                      {existingTypes.has(w.type) ? '已存在 (可添加多个)' : '点击添加'}
                    </div>
                    <PlusCircle size={14} className="absolute opacity-0" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button className="btn" onClick={() => setOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}

function tabLabel(t: string) {
  return { general: '通用', weather: '天气', email: '邮件', briefing: '晨报 / 语音', ai: 'AI', prompts: '提示词', news: '新闻', widgets: '组件' }[t] ?? t;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-white/60 mb-1">{label}</div>
      {children}
    </label>
  );
}

// ── Email accounts ────────────────────────────────────────────────────────

type AccountFormState = {
  id: string | null; // null = adding a new account; otherwise editing
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

  function startAdd() {
    setForm(emptyForm());
  }

  function startEdit(a: EmailAccount) {
    setForm({
      id: a.id,
      label: a.label ?? '',
      user: a.user,
      password: '', // write-only: never echo the stored password back
      host: a.host,
      port: a.port,
      secure: a.secure,
      advancedOpen: true,
    });
  }

  function onEmailChange(value: string) {
    if (!form) return;
    const next: AccountFormState = { ...form, user: value };
    // Auto-infer host/port/secure when the host hasn't been manually set yet
    // (only while adding — don't clobber an editing account's existing host).
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
      // Add
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
      // Edit — keep existing password unless a new one was typed.
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
      <div className="text-xs text-white/50">
        重要邮件、今日日程与晨报会跨所有「已启用」账户聚合。凭据仅保存在本机浏览器 IndexedDB，需运行本地后端。
      </div>

      <div className="space-y-2">
        {accounts.length === 0 && !form && (
          <div className="text-white/40 text-sm">还没有邮箱账户 — 点下方「添加邮箱账户」。</div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="rounded-xl bg-white/5 px-3 py-2 flex items-center gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: colorForAccount(a.id) }}
              title={a.label ? `${a.label} (${a.user})` : a.user}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">
                {a.label ? <span className="text-white/90">{a.label}</span> : null}
                <span className={a.label ? 'text-white/50 ml-2' : 'text-white/90'}>{a.user}</span>
              </div>
              <div className="text-[10px] text-white/40 truncate">{a.host}:{a.port}{a.secure ? ' · TLS' : ''}</div>
            </div>
            <Toggle value={a.enabled} onChange={() => toggleEnabled(a.id)} />
            <button className="text-white/50 hover:text-white p-1" title="编辑" onClick={() => startEdit(a)}>
              <Pencil size={14} />
            </button>
            <button className="text-white/50 hover:text-red-300 p-1" title="删除" onClick={() => remove(a.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {!form && (
        <button className="btn btn-primary" onClick={startAdd}>
          <PlusCircle size={14} /> 添加邮箱账户
        </button>
      )}

      {form && (
        <div className="rounded-xl bg-white/5 p-4 space-y-3">
          <div className="text-sm font-medium text-white/80">{form.id === null ? '添加邮箱账户' : '编辑邮箱账户'}</div>
          <Field label="备注名 (可选，如「工作」)">
            <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="工作 / 个人" />
          </Field>
          <Field label="邮箱地址">
            <input className="input" value={form.user} onChange={(e) => onEmailChange(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label={form.id === null ? '密码 / App Password (仅存本机)' : '密码 / App Password (留空则不修改)'}>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={form.id === null ? '' : '••••••••'}
            />
          </Field>
          <button
            type="button"
            className="text-xs text-aurora-cyan hover:underline"
            onClick={() => setForm({ ...form, advancedOpen: !form.advancedOpen })}
          >
            {form.advancedOpen ? '▾ 高级 (IMAP 主机/端口/SSL)' : '▸ 高级 (IMAP 主机/端口/SSL — 常见邮箱自动填)'}
          </button>
          {form.advancedOpen && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="主机">
                  <input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="imap.example.com" />
                </Field>
                <Field label="端口">
                  <input className="input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="使用 TLS">
                <Toggle value={form.secure} onChange={(v) => setForm({ ...form, secure: v })} />
              </Field>
              {form.id === null && !form.host && (
                <div className="text-[11px] text-white/40">未识别的邮箱域名 — 请手动填写 IMAP 主机。</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button className="btn" onClick={() => setForm(null)}>取消</button>
            <button className="btn btn-primary" onClick={saveForm} disabled={!form.user.trim()}>保存账户</button>
          </div>
        </div>
      )}

      <div className="text-xs text-white/40">Gmail 需启用「App password」(两步验证下生成)，imap.gmail.com:993。</div>
    </div>
  );
}

function FieldList({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <textarea className="input min-h-[120px] font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
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
    <div className="space-y-5">
      <div className="text-xs text-white/50">
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
        <div className="text-[11px] text-white/40 mb-2">
          沿用「邮件 · 重要性判定」的 AI / 关键词模式与关键词；AI 模式下用下方提示词从邮件中提炼可执行待办。
        </div>
        <PromptEditor
          value={prompts.emailTodo}
          defaultValue={DEFAULT_PROMPTS.emailTodo}
          onChange={(v) => setPrompts({ ...prompts, emailTodo: v })}
        />
      </Section>

      <Section title="晨间播报 · 总结提示词">
        <div className="text-[11px] text-white/40 mb-2">
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
    <div className="inline-flex rounded-lg bg-white/5 p-1 text-xs mb-2">
      {(['ai', 'keyword'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={`px-3 py-1 rounded-md transition ${
            value === m ? 'bg-aurora-violet/30 text-white' : 'text-white/60 hover:text-white'
          }`}
          onClick={() => onChange(m)}
        >
          {m === 'ai' ? `AI 判定${aiAvailable ? '' : ' (未配置)'}` : '关键词匹配'}
        </button>
      ))}
    </div>
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
      <textarea
        className="input min-h-[120px] font-mono text-xs leading-relaxed"
        value={text}
        onChange={(e) =>
          onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))
        }
        placeholder={defaultValue.join('\n')}
      />
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <span>{hint ?? '每行一个关键词，大小写不敏感'}</span>
        <button
          type="button"
          className="text-aurora-cyan hover:underline disabled:opacity-30"
          disabled={isDefault}
          onClick={() => onChange([...defaultValue])}
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-white/80 mb-2">{title}</div>
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
      <textarea
        className="input min-h-[140px] font-mono text-xs leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultValue}
      />
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <span>{isDefault ? '使用默认提示词' : '已自定义'}</span>
        <button
          type="button"
          className="text-aurora-cyan hover:underline disabled:opacity-30"
          disabled={isDefault}
          onClick={() => onChange(defaultValue)}
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition relative ${value ? 'bg-aurora-violet' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 ${value ? 'left-[22px]' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`}></span>
    </button>
  );
}

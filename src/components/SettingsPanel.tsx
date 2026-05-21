import { useEffect, useState } from 'react';
import { X, PlusCircle } from 'lucide-react';
import { useStore, useUI } from '@/lib/store';
import { reverseGeocode } from '@/lib/weather';
import { WIDGET_CATALOG } from './widgets';
import type { AppSettings, WidgetInstance } from '@/types';

export function SettingsPanel() {
  const setOpen = useUI((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const addWidget = useStore((s) => s.addWidget);
  const layout = useStore((s) => s.layout);

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [cityQuery, setCityQuery] = useState('');
  const [tab, setTab] = useState<'general' | 'weather' | 'email' | 'ai' | 'news' | 'music' | 'widgets'>('general');

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
        <div className="flex gap-3 px-5 py-3 border-b border-white/10 text-sm overflow-x-auto">
          {(['general','weather','email','ai','news','music','widgets'] as const).map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded-lg ${tab === t ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}
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
            <>
              <Field label="启用 IMAP (需运行本地后端)">
                <Toggle value={draft.emailEnabled} onChange={(v) => up('emailEnabled', v)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="主机"><input className="input" value={draft.emailHost} onChange={(e) => up('emailHost', e.target.value)} /></Field>
                <Field label="端口"><input className="input" type="number" value={draft.emailPort} onChange={(e) => up('emailPort', Number(e.target.value))} /></Field>
              </div>
              <Field label="用户名 / 邮箱"><input className="input" value={draft.emailUser} onChange={(e) => up('emailUser', e.target.value)} /></Field>
              <Field label="密码 / App Password (仅保存在本机浏览器 IndexedDB)">
                <input className="input" type="password" value={draft.emailPassword} onChange={(e) => up('emailPassword', e.target.value)} />
              </Field>
              <Field label="使用 TLS"><Toggle value={draft.emailSecure} onChange={(v) => up('emailSecure', v)} /></Field>
              <div className="text-xs text-white/40">Gmail 需启用「App password」(两步验证下生成)，imap.gmail.com:993。</div>
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
          {tab === 'news' && (
            <FieldList
              label="RSS 源 (每行一个)"
              value={draft.newsFeeds.join('\n')}
              onChange={(v) => up('newsFeeds', v.split('\n').map((s) => s.trim()).filter(Boolean))}
            />
          )}
          {tab === 'music' && (
            <>
              <div className="text-sm text-white/70">音乐播放器支持两种模式：</div>
              <ul className="text-xs text-white/60 list-disc pl-5 space-y-1">
                <li>本地：把音频拖入播放器即可，曲库保存在浏览器内</li>
                <li>Spotify (可选)：填入 Client ID 后使用 OAuth，可启用「从你常听歌曲蒸馏推荐」</li>
              </ul>
              <Field label="启用 Spotify"><Toggle value={draft.spotifyEnabled} onChange={(v) => up('spotifyEnabled', v)} /></Field>
              <Field label="Spotify Client ID"><input className="input" value={draft.spotifyClientId} onChange={(e) => up('spotifyClientId', e.target.value)} /></Field>
            </>
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
  return { general: '通用', weather: '天气', email: '邮件', ai: 'AI', news: '新闻', music: '音乐', widgets: '组件' }[t] ?? t;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-white/60 mb-1">{label}</div>
      {children}
    </label>
  );
}

function FieldList({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <textarea className="input min-h-[120px] font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
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

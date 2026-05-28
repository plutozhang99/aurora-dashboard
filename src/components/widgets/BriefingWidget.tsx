import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sunrise, Play, Pause, RotateCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import {
  loadBriefing,
  saveBriefing,
  loadLastBriefingDate,
  type CachedBriefing,
} from '@/lib/storage';
import { shouldAutoGenerate, todayStr } from '@/lib/briefingTrigger';
import { getTts, ttsAvailable } from '@/lib/tts';
import type { AppSettings, EmailAccount } from '@/types';
import { BackendDownNotice } from './CalendarWidget';

interface BriefingResponse {
  text: string;
  sections?: Record<string, unknown> | null;
  generatedAt: number;
}

function enabledAccounts(settings: AppSettings): EmailAccount[] {
  return settings.emailAccounts.filter((a) => a.enabled);
}

/** First non-empty line/sentence as the collapsed intro. */
function introLine(text: string): string {
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  // If the first line is a long paragraph, clip to the first sentence-ish chunk.
  const sentence = firstLine.split(/(?<=[。！？.!?])/)[0] ?? firstLine;
  return sentence.length > 80 ? `${sentence.slice(0, 80)}…` : sentence;
}

export function BriefingWidget() {
  const settings = useStore((s) => s.settings);
  const accounts = enabledAccounts(settings);

  const [briefing, setBriefing] = useState<CachedBriefing | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hasBackend, setHasBackend] = useState<boolean | null>(null);
  const didInit = useRef(false);

  const tts = getTts(settings.ttsEngine);

  async function generate(): Promise<CachedBriefing | null> {
    const has = await apiAvailable();
    setHasBackend(has);
    if (!has) return null;
    setLoading(true);
    try {
      const res = await api<BriefingResponse>(`/briefing`, {
        method: 'POST',
        body: JSON.stringify({
          accounts,
          newsFeeds: settings.newsFeeds,
          ai: settings.aiProvider !== 'none' && settings.aiApiKey
            ? { provider: settings.aiProvider, apiKey: settings.aiApiKey, model: settings.aiModel }
            : undefined,
          // settings stores it as briefingSummary; the API field is prompts.briefing.
          prompts: { briefing: settings.prompts.briefingSummary },
          today: todayStr(),
        }),
      });
      const cached: CachedBriefing = {
        date: todayStr(),
        text: res.text,
        sections: res.sections ?? null,
        generatedAt: res.generatedAt,
      };
      await saveBriefing(cached);
      setBriefing(cached);
      return cached;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  // On mount: load today's cache; otherwise auto-generate if it's time (AE1/AE2/AE3).
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      const has = await apiAvailable();
      setHasBackend(has);
      const today = todayStr();
      const cached = await loadBriefing();
      // Always surface any cached briefing first (even a stale previous-day one),
      // so a failed background refresh never leaves the user staring at an empty
      // placeholder. generate() replaces it only on success.
      if (cached) setBriefing(cached);
      if (cached && cached.date === today) {
        return; // same-day cache: only one briefing per day (AE2)
      }
      const last = await loadLastBriefingDate();
      if (has && shouldAutoGenerate({ now: new Date(), morningTime: settings.morningTime, lastBriefingDate: last })) {
        // Refresh in the background; generate() keeps the stale cache visible on
        // failure (it only setBriefing on success).
        await generate();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop speech when the widget unmounts.
  useEffect(() => () => tts.stop(), [tts]);

  function togglePlay() {
    if (!briefing) return;
    if (speaking) {
      tts.stop();
      setSpeaking(false);
      return;
    }
    // Autoplay policy: audio is started from a user gesture (this click), so it
    // is allowed. We never auto-speak on mount.
    setSpeaking(true);
    tts.speak(briefing.text, {
      lang: 'zh-CN',
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  async function regenerate() {
    tts.stop();
    setSpeaking(false);
    await generate();
  }

  const dateLabel = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  // The engine layer (getTts) already falls back to the working browser engine
  // for 'cloud', so don't gate the button on the selected engine.
  const canPlay = ttsAvailable() && !!briefing;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-white/80 text-sm min-w-0">
          <Sunrise size={15} className="text-amber-300 shrink-0" />
          <span className="font-medium truncate">晨间播报</span>
          <span className="text-white/40 text-[11px] shrink-0">· {dateLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {briefing && (
            <button
              className="btn px-2 py-1 text-xs gap-1 disabled:opacity-40"
              onClick={togglePlay}
              disabled={!canPlay}
              title={canPlay ? (speaking ? '暂停' : '播放') : '当前环境不支持语音播报'}
            >
              {speaking ? <Pause size={12} /> : <Play size={12} />}
              {speaking ? '暂停' : '播放'}
            </button>
          )}
          {briefing && (
            <button
              className="btn px-2 py-1 text-xs gap-1"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? '收起' : '展开全文'}
            </button>
          )}
          <button
            className="btn px-2 py-1 text-xs gap-1 disabled:opacity-40"
            onClick={regenerate}
            disabled={loading}
            title="重新生成（每天缓存一份）"
          >
            <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? '生成中' : '重新生成'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 scroll-area mt-2 text-sm">
        {hasBackend === false && !briefing && <BackendDownNotice />}
        {hasBackend !== false && !briefing && !loading && (
          <div className="text-white/40">
            {accounts.length === 0
              ? '添加并启用邮箱账户后，晨间播报会汇总今日日程、重要邮件与新闻。'
              : '点「重新生成」获取今天的晨间播报。'}
          </div>
        )}
        {!briefing && loading && <div className="text-white/40">正在生成晨间播报…</div>}
        {briefing && !expanded && (
          <div className="text-white/70 leading-relaxed line-clamp-2">{introLine(briefing.text)}</div>
        )}
        {briefing && expanded && (
          <div className="prose-briefing text-white/80 leading-relaxed whitespace-pre-wrap break-words">
            <ReactMarkdown>{briefing.text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

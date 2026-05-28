import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Play, Pause, ChevronDown,
  Shuffle, SkipBack, SkipForward, Repeat,
  Ellipsis, MessageSquareQuote, ListMusic, Airplay, Volume2,
  Sunrise, Sun, Moon,
} from 'lucide-react';
import { Card, CardContent, ScrollShadow } from '@heroui/react';
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

interface BriefingResponse {
  text: string;
  sections?: Record<string, unknown> | null;
  generatedAt: number;
}

function enabledAccounts(s: AppSettings): EmailAccount[] {
  return s.emailAccounts.filter((a) => a.enabled);
}

function introLine(text: string): string {
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const sentence = firstLine.split(/(?<=[。！？.!?])/)[0] ?? firstLine;
  return sentence.length > 120 ? `${sentence.slice(0, 120)}…` : sentence;
}

/** 早安 / 午安 / 晚安 based on local hour, with a matching emblem icon. */
function greetingFor(now: Date): { zh: string; Icon: typeof Sunrise } {
  const h = now.getHours();
  if (h >= 5 && h < 12) return { zh: '早安', Icon: Sunrise };
  if (h >= 12 && h < 18) return { zh: '午安', Icon: Sun };
  return { zh: '晚安', Icon: Moon };
}

/**
 * Floating music-pill briefing dock. Layout mirrors Apple Music's mini player:
 * shuffle / prev / play / next / repeat on the left, album-art + title in the
 * middle, secondary controls (more, lyrics, queue, airplay, volume) on the
 * right. Only play/pause, lyrics, and repeat are wired — the rest are
 * decorative to keep the silhouette familiar.
 */
export function BriefingPlayer() {
  const settings = useStore((s) => s.settings);
  const accounts = enabledAccounts(settings);

  const [briefing, setBriefing] = useState<CachedBriefing | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hasBackend, setHasBackend] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => new Date());
  const didInit = useRef(false);

  const tts = getTts(settings.ttsEngine);

  // Tick once a minute so the greeting flips at the hour boundaries.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      const has = await apiAvailable();
      setHasBackend(has);
      const today = todayStr();
      const cached = await loadBriefing();
      if (cached) setBriefing(cached);
      if (cached && cached.date === today) return;
      const last = await loadLastBriefingDate();
      if (has && shouldAutoGenerate({ now: new Date(), morningTime: settings.morningTime, lastBriefingDate: last })) {
        await generate();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => tts.stop(), [tts]);

  function togglePlay() {
    if (!briefing) return;
    if (speaking) {
      tts.stop();
      setSpeaking(false);
      return;
    }
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

  const { zh: greeting, Icon: GreetingIcon } = greetingFor(now);
  const dateLabel = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const canPlay = ttsAvailable() && !!briefing;
  const subtitle = briefing
    ? introLine(briefing.text)
    : hasBackend === false
      ? '本地后端未运行 — 启动后端后可生成播报。'
      : loading
        ? '正在生成播报…'
        : accounts.length === 0
          ? '在 设置 → 邮件 添加账户后可生成今日播报。'
          : 'Aurora · 今日早报';

  return (
    <>
      {/* Lyrics panel — slides up above the pill */}
      {expanded && briefing && (
        <div className="fixed inset-x-0 bottom-[88px] z-30 px-3 pointer-events-none">
          <Card className="player-panel pointer-events-auto max-w-3xl mx-auto bg-card shadow-card">
            <CardContent className="p-0">
              <div className="sec-head px-6 pt-6 pb-3 mb-3">
                <span className="kicker truncate">播报 · Briefing · {dateLabel}</span>
                <button
                  type="button"
                  className="player-icon-btn"
                  onClick={() => setExpanded(false)}
                  aria-label="收起"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <ScrollShadow hideScrollBar className="max-h-[58vh] px-6 pb-6">
                <div className="lyrics">
                  <ReactMarkdown>{briefing.text}</ReactMarkdown>
                </div>
              </ScrollShadow>
            </CardContent>
          </Card>
        </div>
      )}

      {/* The pill — centered, floating, always-on */}
      <div className="fixed inset-x-0 bottom-4 z-30 pointer-events-none px-3">
        <div className="player-pill pointer-events-auto mx-auto flex items-center gap-1.5 sm:gap-2">
          {/* Left transport cluster */}
          <PillIcon label="随机" onClick={regenerate} disabled={loading}>
            <Shuffle size={16} className={loading ? 'animate-spin' : ''} />
          </PillIcon>
          <PillIcon label="上一首" decorative>
            <SkipBack size={18} />
          </PillIcon>
          <button
            type="button"
            className="player-play"
            onClick={togglePlay}
            disabled={!canPlay}
            aria-label={canPlay ? (speaking ? '暂停' : '播放') : '当前环境不支持语音播报'}
          >
            {speaking ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
          <PillIcon label="下一首" decorative>
            <SkipForward size={18} />
          </PillIcon>
          <PillIcon label="重新生成" onClick={regenerate} disabled={loading}>
            <Repeat size={16} className={loading ? 'animate-spin' : ''} />
          </PillIcon>

          {/* Vertical hairline divider */}
          <span className="hidden sm:block w-px h-7 bg-rule mx-1" aria-hidden />

          {/* Album art */}
          <div className="player-art shrink-0" aria-hidden>
            <GreetingIcon size={20} />
          </div>

          {/* Title + subtitle — clicking expands lyrics */}
          <button
            type="button"
            className="player-title min-w-0 flex-1 text-left disabled:cursor-default focus:outline-none"
            onClick={() => briefing && setExpanded((v) => !v)}
            disabled={!briefing}
            aria-label={briefing ? (expanded ? '收起全文' : '展开全文') : '暂无播报'}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-ink font-medium text-[13.5px]">
                {greeting}，{dateLabel}
              </span>
              {speaking && (
                <span className="eq shrink-0" aria-hidden>
                  <i /><i /><i /><i />
                </span>
              )}
              {briefing && !speaking && (
                <span className="text-ember text-[11px] shrink-0" aria-hidden>★</span>
              )}
            </div>
            <div className="truncate text-ink-3 text-[12px] leading-tight">
              {subtitle}
            </div>
          </button>

          {/* Right secondary cluster */}
          <PillIcon label="更多" decorative>
            <Ellipsis size={16} />
          </PillIcon>
          <PillIcon
            label={expanded ? '收起歌词' : '查看歌词'}
            onClick={() => briefing && setExpanded((v) => !v)}
            disabled={!briefing}
            active={expanded}
          >
            <MessageSquareQuote size={16} />
          </PillIcon>
          <PillIcon label="播放队列" decorative>
            <ListMusic size={16} />
          </PillIcon>
          <PillIcon label="AirPlay" decorative>
            <Airplay size={16} />
          </PillIcon>
          <PillIcon label="音量" decorative>
            <Volume2 size={16} />
          </PillIcon>
        </div>
      </div>
    </>
  );
}

interface PillIconProps {
  label: string;
  onClick?: () => void;
  /** Visible but non-interactive — keeps the Apple Music silhouette intact. */
  decorative?: boolean;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function PillIcon({ label, onClick, decorative, disabled, active, children }: PillIconProps) {
  if (decorative) {
    return (
      <span
        className="player-icon-btn player-icon-deco"
        aria-label={label}
        title={label}
      >
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`player-icon-btn ${active ? 'is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Button, Card, Flex, Space, Typography } from 'antd';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import { aiPayload } from '@/lib/ai';
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
  return sentence.length > 120 ? `${sentence.slice(0, 120)}...` : sentence;
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return '早安';
  if (h >= 12 && h < 18) return '午安';
  return '晚安';
}

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
          ai: aiPayload(settings),
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
      voice: settings.ttsVoice,
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  async function regenerate() {
    tts.stop();
    setSpeaking(false);
    await generate();
  }

  const greeting = greetingFor(now);
  const dateLabel = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const canPlay = ttsAvailable(settings.ttsEngine) && !!briefing;
  const subtitle = briefing
    ? introLine(briefing.text)
    : hasBackend === false
      ? '本地后端未运行，启动后端后可生成播报。'
      : loading
        ? '正在生成播报...'
        : accounts.length === 0
          ? '在 设置 -> 邮件 添加账户后可生成今日播报。'
          : 'Aurora · 今日早报';

  return (
    <>
      {expanded && briefing && (
        <Card className="briefing-panel">
          <Flex vertical gap={12}>
            <Flex justify="space-between" align="center" gap={12}>
              <Typography.Text className="kicker">播报 · Briefing · {dateLabel}</Typography.Text>
              <Button onClick={() => setExpanded(false)}>收起</Button>
            </Flex>
            <Typography.Paragraph className="lyrics-text">{briefing.text}</Typography.Paragraph>
          </Flex>
        </Card>
      )}

      <Card className="briefing-pill" styles={{ body: { padding: '8px 12px' } }}>
        <Flex align="center" gap={10}>
          <Button type="primary" onClick={togglePlay} disabled={!canPlay}>
            {speaking ? '暂停' : '播放'}
          </Button>
          <Button onClick={regenerate} loading={loading}>重生成</Button>
          <Button type="text" className="briefing-title" onClick={() => briefing && setExpanded((v) => !v)} disabled={!briefing}>
            <Space direction="vertical" size={0} align="start">
              <Typography.Text strong>{greeting}，{dateLabel}</Typography.Text>
              <Typography.Text type="secondary" ellipsis>{subtitle}</Typography.Text>
            </Space>
          </Button>
        </Flex>
      </Card>
    </>
  );
}

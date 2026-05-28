import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Chip } from '@heroui/react';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import type { NewsItem } from '@/types';

export function NewsWidget() {
  const feeds = useStore((s) => s.settings.newsFeeds);
  const { data, isLoading } = useQuery({
    queryKey: ['news', feeds],
    queryFn: async (): Promise<NewsItem[]> => {
      const ok = await apiAvailable();
      if (!ok) return [];
      const res = await api<{ items: NewsItem[] }>(`/news`, {
        method: 'POST',
        body: JSON.stringify({ feeds }),
      });
      return res.items;
    },
    refetchInterval: 1000 * 60 * 15,
  });

  return (
    <div className="h-full w-full flex flex-col">
      <div className="sec-head">
        <span className="kicker truncate">新闻 · News</span>
        <Chip size="sm" color="default" variant="soft" className="shrink-0">{data?.length ?? 0} 篇</Chip>
      </div>
      <div className="flex-1 min-h-0 scroll-area mt-3">
        {isLoading && <div className="text-ink-3 text-sm">抓取 RSS…</div>}
        {!isLoading && !data && (
          <div className="text-ink-3 text-sm">未连接本地后端，无法抓取 RSS。</div>
        )}
        <div className="divide-y divide-rule">
          {data?.map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="group block py-2.5 first:pt-0"
            >
              <div className="text-sm leading-snug line-clamp-2 text-ink group-hover:text-ember transition-colors">{n.title}</div>
              <div className="kicker flex items-center gap-1.5 mt-1">
                <span className="truncate">{n.source}</span>
                <span className="text-ink-4">·</span>
                <span className="num normal-case tracking-normal">{new Date(n.publishedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <ExternalLink size={11} className="ml-auto text-ink-4 group-hover:text-ember transition-colors" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

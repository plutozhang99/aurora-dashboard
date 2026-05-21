import { useQuery } from '@tanstack/react-query';
import { Newspaper, ExternalLink } from 'lucide-react';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import type { NewsItem } from '@/types';
import { Header } from './CalendarWidget';

export function NewsWidget() {
  const feeds = useStore((s) => s.settings.newsFeeds);
  const { data, isLoading, error } = useQuery({
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
      <Header icon={<Newspaper size={14} />} title="新闻" right={`${data?.length ?? 0} 篇`} />
      <div className="flex-1 min-h-0 scroll-area space-y-1.5 mt-2">
        {isLoading && <div className="text-white/40 text-sm">抓取 RSS…</div>}
        {!isLoading && !data && (
          <div className="text-white/40 text-sm">未连接本地后端，无法抓取 RSS。</div>
        )}
        {data?.map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg bg-white/5 hover:bg-white/10 px-3 py-2"
          >
            <div className="text-sm leading-snug line-clamp-2">{n.title}</div>
            <div className="text-[11px] text-white/40 flex items-center gap-1 mt-0.5">
              <span className="truncate">{n.source}</span>
              <span>·</span>
              <span>{new Date(n.publishedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <ExternalLink size={10} className="ml-auto opacity-60" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

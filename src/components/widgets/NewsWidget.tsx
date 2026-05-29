import { Flex, List, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { api, apiAvailable } from '@/lib/api';
import type { NewsItem } from '@/types';
import { WidgetHeader } from './CalendarWidget';

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
    <Flex vertical className="widget-content">
      <WidgetHeader title="新闻 · News" right={`${data?.length ?? 0} 篇`} />
      {isLoading && <Typography.Text type="secondary">抓取 RSS...</Typography.Text>}
      {!isLoading && !data && <Typography.Text type="secondary">未连接本地后端，无法抓取 RSS。</Typography.Text>}
      <List
        split
        dataSource={data ?? []}
        renderItem={(n) => (
          <List.Item>
            <Flex vertical gap={4} className="full-width">
              <Typography.Link href={n.url} target="_blank" rel="noreferrer">
                {n.title}
              </Typography.Link>
              <Flex gap={8} align="center" wrap="wrap">
                <Tag>{n.source}</Tag>
                <Typography.Text type="secondary" className="num">
                  {new Date(n.publishedAt).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Typography.Text>
              </Flex>
            </Flex>
          </List.Item>
        )}
      />
    </Flex>
  );
}

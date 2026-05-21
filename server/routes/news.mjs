import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10_000 });

export async function newsRoute(req, res) {
  const feeds = Array.isArray(req.body?.feeds) ? req.body.feeds : [];
  const items = [];
  await Promise.all(feeds.map(async (url) => {
    try {
      const feed = await parser.parseURL(url);
      for (const it of feed.items.slice(0, 8)) {
        items.push({
          id: it.guid || it.id || `${feed.title}:${it.title}:${it.pubDate}`,
          title: it.title || '(no title)',
          source: feed.title || new URL(url).host,
          url: it.link || url,
          publishedAt: it.isoDate ? Date.parse(it.isoDate) : Date.now(),
        });
      }
    } catch (e) {
      // skip broken feed
    }
  }));
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  res.json({ items: items.slice(0, 30) });
}

import { Flex, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { fetchWeather, weatherIcon } from '@/lib/weather';
import { WidgetHeader } from './CalendarWidget';

export function NowWidget() {
  const s = useStore((st) => st.settings);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data } = useQuery({
    queryKey: ['weather', s.weatherLat, s.weatherLon, s.weatherUnit],
    queryFn: () => fetchWeather(s.weatherLat, s.weatherLon, s.weatherUnit),
    refetchInterval: 1000 * 60 * 15,
  });

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const unit = s.weatherUnit === 'imperial' ? '°F' : '°C';
  const wc = data ? weatherIcon(data.weatherCode, data.isDay) : null;
  const today = data?.daily?.[0];

  return (
    <Flex vertical className="widget-content now-widget">
      <WidgetHeader title="此刻 · Now" right={data ? wc?.label : undefined} />
      <Flex className="now-main" align="center" justify="space-between" gap={20}>
        <Flex vertical gap={8} className="now-time">
          <Typography.Title level={1} className="clock-title">
            {hh}:{mm}<Typography.Text type="secondary" className="clock-seconds">{ss}</Typography.Text>
          </Typography.Title>
          <Typography.Text className="num">{dateStr}</Typography.Text>
        </Flex>

        {data ? (
          <Flex className="now-weather" align="center" justify="flex-end" gap={14}>
            <Typography.Text className="weather-emoji">{wc?.emoji}</Typography.Text>
            <Flex vertical align="flex-end">
              <Statistic className="weather-stat" value={Math.round(data.temperature)} suffix={unit} />
              <Tag className="weather-tag">
                {s.weatherCityLabel}
                {today ? ` · ↑${Math.round(today.max)}° ↓${Math.round(today.min)}°` : ''}
              </Tag>
            </Flex>
          </Flex>
        ) : (
          <Typography.Text type="secondary">天气 --</Typography.Text>
        )}
      </Flex>
    </Flex>
  );
}

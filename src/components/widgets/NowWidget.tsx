import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chip } from '@heroui/react';
import { useStore } from '@/lib/store';
import { fetchWeather, weatherIcon } from '@/lib/weather';

/** Current date + time + weather. Type scales with the widget's own height. */
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
    <div className="h-full w-full flex flex-col" style={{ containerType: 'size' }}>
      <div className="sec-head">
        <span className="kicker truncate">此刻 · Now</span>
        {data && <Chip size="sm" color="default" variant="soft" className="shrink-0">{wc?.label}</Chip>}
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-between gap-6 mt-3">
        {/* time + date */}
        <div className="min-w-0">
          <div className="font-display font-semibold leading-none text-ink tracking-tight tabular-nums text-[clamp(2.75rem,24cqh,6rem)]">
            {hh}:{mm}
            <span className="num text-ink-3 align-top ml-1.5 text-[0.3em]">{ss}</span>
          </div>
          <div className="num text-ink-2 uppercase tracking-[0.1em] mt-3 text-[clamp(0.85rem,5.5cqh,1.15rem)]">
            {dateStr}
          </div>
        </div>

        {/* weather */}
        {data ? (
          <div className="flex items-center gap-4 shrink-0">
            <div className="leading-none text-[clamp(2.25rem,18cqh,5rem)]">{wc?.emoji}</div>
            <div className="text-right">
              <div className="font-display font-semibold leading-none text-ink text-[clamp(1.6rem,15cqh,3.25rem)]">
                {Math.round(data.temperature)}
                <span className="num text-ink-3 align-top text-[0.38em]">{unit}</span>
              </div>
              <div className="num text-ink-2 mt-2 text-[clamp(0.75rem,5cqh,1rem)]">
                {s.weatherCityLabel}
                {today && <span className="text-ink-3"> · ↑{Math.round(today.max)}° ↓{Math.round(today.min)}°</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="num text-ink-4 text-sm shrink-0">天气 —</div>
        )}
      </div>
    </div>
  );
}

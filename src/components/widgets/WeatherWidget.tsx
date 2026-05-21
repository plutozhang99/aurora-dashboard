import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import { fetchWeather, weatherIcon } from '@/lib/weather';

export function WeatherWidget() {
  const s = useStore((st) => st.settings);
  const { data, isLoading, error } = useQuery({
    queryKey: ['weather', s.weatherLat, s.weatherLon, s.weatherUnit],
    queryFn: () => fetchWeather(s.weatherLat, s.weatherLon, s.weatherUnit),
    refetchInterval: 1000 * 60 * 15,
  });

  if (isLoading) return <Empty>加载天气…</Empty>;
  if (error || !data) return <Empty>无法获取天气</Empty>;

  const cur = weatherIcon(data.weatherCode, data.isDay);
  const unit = s.weatherUnit === 'imperial' ? '°F' : '°C';

  return (
    // containerType: size lets child elements size with cqh units relative to
    // this widget's own box, so the hero block stops overlapping when the
    // widget is shortened by "填满".
    <div className="h-full w-full flex flex-col" style={{ containerType: 'size' }}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/60">{s.weatherCityLabel}</div>
        <div className="chip">{cur.label}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex items-center gap-4">
        <div className="leading-none text-[clamp(2rem,12cqh,5rem)]">{cur.emoji}</div>
        <div className="min-w-0">
          <div className="font-display font-semibold leading-none text-[clamp(1.5rem,10cqh,3.5rem)]">
            {Math.round(data.temperature)}<span className="text-white/40 text-[0.6em]">{unit}</span>
          </div>
          <div className="text-[11px] text-white/60 mt-1 truncate">体感 {Math.round(data.apparent)}{unit} · 湿度 {data.humidity}%</div>
        </div>
      </div>
      <div className="shrink-0 grid grid-cols-5 gap-1 mt-1">
        {data.daily.map((d) => {
          const wi = weatherIcon(d.code);
          return (
            <div key={d.date} className="rounded-lg bg-white/5 px-1.5 py-1 text-center">
              <div className="text-[10px] text-white/50">{new Date(d.date).toLocaleDateString('zh-CN', { weekday: 'short' })}</div>
              <div className="text-base leading-tight">{wi.emoji}</div>
              <div className="text-[10px] text-white/70 tabular-nums">{Math.round(d.max)}°/{Math.round(d.min)}°</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-full grid place-items-center text-white/50 text-sm">{children}</div>;
}

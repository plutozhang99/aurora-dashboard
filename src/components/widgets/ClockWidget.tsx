import { useEffect, useState } from 'react';

export function ClockWidget() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <div className="h-full w-full flex flex-col justify-center items-center text-center">
      <div className="font-display font-bold text-[clamp(2.5rem,8vw,5rem)] tracking-tight leading-none gradient-text tabular-nums">
        {hh}:{mm}<span className="text-white/40 text-[0.5em] align-top">{ss}</span>
      </div>
      <div className="mt-2 text-white/70 text-sm">{dateStr}</div>
    </div>
  );
}

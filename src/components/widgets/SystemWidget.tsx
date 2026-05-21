import { useQuery } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';
import { api, apiAvailable } from '@/lib/api';
import { Header } from './CalendarWidget';

interface SysStats {
  cpu: number;
  memTotal: number;
  memUsed: number;
  loadAvg: number[];
  uptimeSec: number;
  hostname: string;
  os: string;
}

export function SystemWidget() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sys'],
    queryFn: async (): Promise<SysStats | null> => {
      const ok = await apiAvailable();
      if (!ok) return null;
      return await api<SysStats>('/system');
    },
    refetchInterval: 3000,
  });

  if (isLoading) return <Wrap><div className="text-white/40 text-sm">读取系统状态…</div></Wrap>;
  if (error || !data) return <Wrap><div className="text-white/40 text-sm">未连接本地后端 — 启动 <code className="font-mono text-white/60">npm run dev</code> 后自动可用。</div></Wrap>;

  const memPct = data.memUsed / data.memTotal;
  return (
    <Wrap>
      <div className="grid grid-cols-2 gap-3 mt-2 flex-1 min-h-0">
        <Gauge label="CPU" value={data.cpu / 100} color="from-aurora-cyan to-aurora-blue" pct={`${data.cpu.toFixed(0)}%`} />
        <Gauge label="内存" value={memPct} color="from-aurora-violet to-aurora-pink" pct={`${(memPct * 100).toFixed(0)}%`} />
      </div>
      <div className="text-[11px] text-white/50 mt-2 space-y-0.5 truncate">
        <div>{data.hostname} · {data.os}</div>
        <div>负载 {data.loadAvg.map((l) => l.toFixed(2)).join(' / ')}</div>
        <div>已运行 {formatUptime(data.uptimeSec)}</div>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full flex flex-col">
      <Header icon={<Cpu size={14} />} title="系统占用" />
      {children}
    </div>
  );
}

function Gauge({ label, value, color, pct }: { label: string; value: number; color: string; pct: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="rounded-xl bg-white/5 p-3 flex flex-col">
      <div className="flex items-center justify-between text-xs text-white/60"><span>{label}</span><span className="font-mono">{pct}</span></div>
      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} transition-all`} style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

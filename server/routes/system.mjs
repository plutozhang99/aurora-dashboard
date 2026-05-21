import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import nou from 'node-os-utils';

const { cpu } = nou;
const execAsync = promisify(exec);

// macOS's os.freemem() omits inactive/cached pages, making memory look ~99% used.
// Parse vm_stat and treat used = (active + wired + compressed) * page_size.
async function darwinMemUsed() {
  const { stdout } = await execAsync('vm_stat');
  const pageSizeMatch = stdout.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
  const get = (label) => {
    const m = stdout.match(new RegExp(`${label}:\\s+(\\d+)`));
    return m ? Number(m[1]) : 0;
  };
  const active = get('Pages active');
  const wired = get('Pages wired down');
  const compressed = get('Pages occupied by compressor');
  return (active + wired + compressed) * pageSize;
}

export async function systemRoute(_req, res) {
  try {
    const usage = await cpu.usage(500);
    const memTotal = os.totalmem();
    let memUsed;
    if (process.platform === 'darwin') {
      try {
        memUsed = await darwinMemUsed();
      } catch {
        memUsed = memTotal - os.freemem();
      }
    } else {
      memUsed = memTotal - os.freemem();
    }
    res.json({
      cpu: usage,
      memTotal,
      memUsed,
      loadAvg: os.loadavg(),
      uptimeSec: os.uptime(),
      hostname: os.hostname(),
      os: `${os.platform()} ${os.release()} · ${os.arch()}`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

import os from 'node:os';
import nou from 'node-os-utils';

const { cpu } = nou;

export async function systemRoute(_req, res) {
  try {
    const usage = await cpu.usage(500);
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    res.json({
      cpu: usage,
      memTotal,
      memUsed: memTotal - memFree,
      loadAvg: os.loadavg(),
      uptimeSec: os.uptime(),
      hostname: os.hostname(),
      os: `${os.platform()} ${os.release()} · ${os.arch()}`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

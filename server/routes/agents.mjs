import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Important: we ONLY read the agent CLI's own local state files. We do not
 * scrape vendor APIs that would violate ToS. If the CLI has no quota file,
 * we report only whatever we can derive locally (last-session timestamps,
 * project counts, etc.) and let the user input quota manually via the
 * widget's settings.
 *
 * Last reviewed Apr 2026 — Anthropic Usage Policy permits reading local
 * caches you authored. Programmatically calling internal/undocumented
 * endpoints is not permitted; this file does not do that.
 */
export async function agentsRoute(_req, res) {
  const home = os.homedir();
  const agents = [];

  // Claude Code: ~/.claude/
  try {
    const dir = path.join(home, '.claude');
    const stat = await fs.stat(dir).catch(() => null);
    if (stat?.isDirectory()) {
      const projects = await fs.readdir(path.join(dir, 'projects')).catch(() => []);
      // Best-effort: find newest session file mtime to estimate "last reset" — purely informational.
      let newestSession = 0;
      for (const p of projects.slice(0, 50)) {
        const sessions = await fs.readdir(path.join(dir, 'projects', p)).catch(() => []);
        for (const s of sessions) {
          const st = await fs.stat(path.join(dir, 'projects', p, s)).catch(() => null);
          if (st?.mtimeMs && st.mtimeMs > newestSession) newestSession = st.mtimeMs;
        }
      }
      agents.push({
        name: 'Claude Code',
        note: `本地项目 ${projects.length} 个 · 最近活动 ${newestSession ? new Date(newestSession).toLocaleString('zh-CN') : '—'}`,
      });
    }
  } catch {}

  // OpenAI Codex CLI: ~/.codex/
  try {
    const dir = path.join(home, '.codex');
    const stat = await fs.stat(dir).catch(() => null);
    if (stat?.isDirectory()) {
      const sessions = await fs.readdir(path.join(dir, 'sessions')).catch(() => []);
      agents.push({
        name: 'OpenAI Codex',
        note: `会话目录 ${sessions.length} 个`,
      });
    }
  } catch {}

  if (agents.length === 0) {
    agents.push({ name: 'Claude Code', note: '未检测到 ~/.claude — 安装后将显示' });
    agents.push({ name: 'OpenAI Codex', note: '未检测到 ~/.codex' });
  }

  res.json({ agents, source: '本地 CLI 缓存 (合规)' });
}

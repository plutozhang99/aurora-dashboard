import { useStore } from './store';

export function apiBase(): string {
  const url = useStore.getState().settings.serverUrl?.trim();
  if (url) return url.replace(/\/$/, '');
  return '/api';
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

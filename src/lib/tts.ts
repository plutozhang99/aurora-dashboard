/**
 * Pluggable text-to-speech.
 *
 * Two engines behind a common `TtsEngine` interface:
 *  - `browser` — native Web Speech (free, offline, voice quality varies by OS).
 *  - `cloud`   — POSTs the text to the backend `/api/tts` (edge-tts → MP3) and
 *               plays the returned audio. Falls back to the browser engine if
 *               the backend is unreachable, so the user still hears something.
 * All entry points guard for environments without `speechSynthesis` / `Audio`.
 */

import { apiBase } from './api';

export interface SpeakOptions {
  /** BCP-47 lang hint, e.g. "zh-CN". Used by the browser engine. */
  lang?: string;
  /** Cloud-engine neural voice id, e.g. "zh-CN-XiaoxiaoNeural". */
  voice?: string;
  /** 0.1–10, default 1. */
  rate?: number;
  /** 0–2, default 1. (Browser engine only.) */
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface TtsEngine {
  /** True when this engine can actually speak in the current environment. */
  available(): boolean;
  speak(text: string, opts?: SpeakOptions): void;
  stop(): void;
}

function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function hasAudio(): boolean {
  return typeof window !== 'undefined' && typeof window.Audio !== 'undefined';
}

/** Browser Web Speech engine. No-ops gracefully when unsupported. */
const browserEngine: TtsEngine = {
  available: hasSpeechSynthesis,
  speak(text, opts) {
    if (!hasSpeechSynthesis() || !text.trim()) {
      opts?.onError?.(new Error('speechSynthesis unavailable'));
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts?.lang ?? 'zh-CN';
    u.rate = opts?.rate ?? 1;
    u.pitch = opts?.pitch ?? 1;
    if (opts?.onStart) u.onstart = () => opts.onStart!();
    if (opts?.onEnd) u.onend = () => opts.onEnd!();
    if (opts?.onError) u.onerror = (e) => opts.onError!(e);
    window.speechSynthesis.speak(u);
  },
  stop() {
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
  },
};

/**
 * Cloud engine: synthesize on the backend (edge-tts) and play the MP3.
 *
 * Single instance with mutable playback state — `stop()` aborts both an
 * in-flight request and a playing clip. Any backend/network failure transparently
 * falls back to the browser engine so playback never silently dies.
 */
function createCloudEngine(): TtsEngine {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let token = 0; // bumped on stop()/new speak() to ignore stale responses

  function cleanup() {
    if (audio) {
      audio.pause();
      audio.src = '';
      audio = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  return {
    available: hasAudio,
    speak(text, opts) {
      if (!text.trim()) {
        opts?.onError?.(new Error('empty text'));
        return;
      }
      const mine = ++token;
      cleanup();
      browserEngine.stop();

      fetch(`${apiBase()}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: opts?.voice, rate: opts?.rate ?? 1 }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`TTS ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (mine !== token) return; // superseded by a newer call / stopped
          objectUrl = URL.createObjectURL(blob);
          audio = new window.Audio(objectUrl);
          audio.onplay = () => opts?.onStart?.();
          audio.onended = () => {
            if (mine === token) cleanup();
            opts?.onEnd?.();
          };
          audio.onerror = () => {
            if (mine === token) cleanup();
            opts?.onError?.(new Error('audio playback failed'));
          };
          audio.play().catch((e) => opts?.onError?.(e));
        })
        .catch(() => {
          // Backend unreachable or synthesis failed — fall back to the browser
          // engine so the briefing still plays.
          if (mine === token) browserEngine.speak(text, opts);
        });
    },
    stop() {
      token++;
      cleanup();
      browserEngine.stop();
    },
  };
}

const cloudEngine = createCloudEngine();

const engines: Record<'browser' | 'cloud', TtsEngine> = {
  browser: browserEngine,
  cloud: cloudEngine,
};

export function getTts(engine: 'browser' | 'cloud' = 'browser'): TtsEngine {
  return engines[engine] ?? browserEngine;
}

/** Convenience: speak with the default (browser) engine. */
export function speak(text: string, opts?: SpeakOptions) {
  getTts('browser').speak(text, opts);
}

export function stop() {
  getTts('browser').stop();
}

/** Whether the given engine is usable right now (used to gate the play button). */
export function ttsAvailable(engine: 'browser' | 'cloud' = 'browser'): boolean {
  return getTts(engine).available();
}

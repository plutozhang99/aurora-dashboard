/**
 * Pluggable text-to-speech.
 *
 * v1 ships only a browser (Web Speech) engine; the `TtsEngine` interface is
 * defined so a 'cloud' engine could slot in later without touching callers.
 * All entry points guard for environments without `speechSynthesis`.
 */

export interface SpeakOptions {
  /** BCP-47 lang hint, e.g. "zh-CN". */
  lang?: string;
  /** 0.1–10, default 1. */
  rate?: number;
  /** 0–2, default 1. */
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

// Cloud engine reserved for a future version (R13). Interface-only for now.
const engines: Record<'browser' | 'cloud', TtsEngine> = {
  browser: browserEngine,
  // Falls back to the browser engine until a real cloud adapter lands.
  cloud: browserEngine,
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

/** Whether any TTS is usable right now (used to disable the play button). */
export function ttsAvailable(): boolean {
  return browserEngine.available();
}

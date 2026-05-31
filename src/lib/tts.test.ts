import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTts, ttsAvailable } from './tts';

/**
 * The cloud engine talks to the backend `/api/tts` and plays the MP3; on failure
 * it falls back to the browser engine. vitest runs in node, so we stub the
 * browser globals (window.Audio, speechSynthesis, fetch, URL.createObjectURL).
 */

class FakeAudio {
  static last: FakeAudio | null = null;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor(src?: string) {
    this.src = src ?? '';
    FakeAudio.last = this;
  }
  play() {
    this.onplay?.();
    return Promise.resolve();
  }
  pause() {}
}

let spoken: string[] = [];

beforeEach(() => {
  spoken = [];
  FakeAudio.last = null;
  vi.stubGlobal('window', {
    Audio: FakeAudio,
    speechSynthesis: {
      cancel: vi.fn(),
      speak: (u: { text: string; onend?: (() => void) | null }) => {
        spoken.push(u.text);
        u.onend?.();
      },
    },
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      rate = 1;
      pitch = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => 'blob:fake');
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cloud tts engine', () => {
  it('POSTs text + voice to /api/tts and plays the returned audio', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const onStart = vi.fn();
    const onEnd = vi.fn();
    getTts('cloud').speak('早安', { voice: 'zh-CN-YunxiNeural', onStart, onEnd });

    await vi.waitFor(() => expect(FakeAudio.last).not.toBeNull());

    // Hit the backend TTS endpoint with the right body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tts');
    expect(JSON.parse(init.body as string)).toMatchObject({
      text: '早安',
      voice: 'zh-CN-YunxiNeural',
    });

    expect(onStart).toHaveBeenCalled();
    FakeAudio.last!.onended?.();
    expect(onEnd).toHaveBeenCalled();
    // Never fell through to the browser engine on success.
    expect(spoken).toEqual([]);
  });

  it('falls back to the browser engine when the backend fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, blob: async () => new Blob() })),
    );

    getTts('cloud').speak('回退测试', { voice: 'zh-CN-XiaoxiaoNeural' });

    await vi.waitFor(() => expect(spoken).toEqual(['回退测试']));
    expect(FakeAudio.last).toBeNull(); // no audio element was created
  });

  it('reports cloud availability via the Audio API', () => {
    expect(ttsAvailable('cloud')).toBe(true);
  });
});

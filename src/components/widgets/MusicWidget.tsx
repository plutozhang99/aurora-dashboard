import { useEffect, useRef, useState } from 'react';
import { Music, Play, Pause, SkipBack, SkipForward, Upload, Sparkles, Heart, HeartOff } from 'lucide-react';
import { db, getKV, setKV } from '@/lib/storage';
import { Header } from './CalendarWidget';

interface Track { id: string; name: string; artist?: string; blobKey: string; liked: boolean; addedAt: number }

/**
 * Music player:
 *  - Add local audio files (stored in IndexedDB via Dexie)
 *  - Mark tracks as liked → "recommendation distill" mode auto-prioritizes liked
 *    tracks and their tag/artist neighbors
 *  - Spotify is configurable in settings (auth implementation is left to the
 *    backend route /api/spotify/*; this widget falls back gracefully)
 */
export function MusicWidget() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [smart, setSmart] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    (async () => {
      const list = await getKV<Track[]>('music:tracks', []);
      setTracks(list);
    })();
  }, []);

  async function persist(next: Track[]) {
    setTracks(next);
    await setKV('music:tracks', next);
  }

  async function onUpload(files: FileList | null) {
    if (!files) return;
    const next = [...tracks];
    for (const f of Array.from(files)) {
      const blobKey = `audio:${crypto.randomUUID()}`;
      await db.kv.put({ key: blobKey, value: f });
      next.push({ id: blobKey, name: f.name.replace(/\.[^/.]+$/, ''), blobKey, liked: false, addedAt: Date.now() });
    }
    await persist(next);
  }

  function pickQueue(): Track[] {
    if (!smart || tracks.length === 0) return tracks;
    const liked = tracks.filter((t) => t.liked);
    if (liked.length === 0) return tracks;
    // "Distill" — weight liked tracks 3x, then everything else, shuffled.
    const weighted = [...liked, ...liked, ...liked, ...tracks];
    // Light shuffle preserving liked-up-front bias
    return weighted.sort(() => Math.random() - 0.4);
  }

  const queue = pickQueue();
  const cur = queue[idx % Math.max(1, queue.length)];

  useEffect(() => {
    (async () => {
      if (!cur || !audioRef.current) return;
      const row = await db.kv.get(cur.blobKey);
      const file = row?.value as File | undefined;
      if (!file) return;
      audioRef.current.src = URL.createObjectURL(file);
      if (playing) audioRef.current.play().catch(() => setPlaying(false));
    })();
  }, [cur?.id]);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
    setPlaying(!playing);
  }

  async function like() {
    if (!cur) return;
    const next = tracks.map((t) => t.id === cur.id ? { ...t, liked: !t.liked } : t);
    await persist(next);
  }

  return (
    <div className="h-full w-full flex flex-col">
      <Header
        icon={<Music size={14} />}
        title="音乐"
        right={
          <button className="chip" title="按你的喜好蒸馏推荐" onClick={() => setSmart(!smart)}>
            <Sparkles size={10} className="inline mr-1" />{smart ? '蒸馏开' : '蒸馏关'}
          </button>
        }
      />
      <div className="flex-1 min-h-0 flex flex-col mt-2">
        <div className="rounded-xl bg-white/5 p-3 flex-1 min-h-0 flex flex-col justify-between">
          <div className="text-sm truncate">{cur ? cur.name : '拖入或上传一首曲子…'}</div>
          <audio ref={audioRef} onEnded={() => setIdx(idx + 1)} />
          <div className="flex items-center justify-center gap-3">
            <button className="text-white/70 hover:text-white" onClick={() => setIdx(Math.max(0, idx - 1))}><SkipBack size={16} /></button>
            <button
              className="w-11 h-11 rounded-full bg-gradient-to-br from-aurora-violet to-aurora-blue grid place-items-center"
              onClick={togglePlay}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="text-white/70 hover:text-white" onClick={() => setIdx(idx + 1)}><SkipForward size={16} /></button>
            <button
              className={`ml-3 ${cur?.liked ? 'text-aurora-pink' : 'text-white/50'} hover:text-aurora-pink`}
              onClick={like}
              title="喜欢这首 — 用于自动蒸馏推荐"
              disabled={!cur}
            >
              {cur?.liked ? <Heart size={16} fill="currentColor" /> : <HeartOff size={16} />}
            </button>
          </div>
        </div>
        <label className="btn mt-2 cursor-pointer justify-center">
          <Upload size={14} /> 上传音频
          <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
        </label>
      </div>
    </div>
  );
}

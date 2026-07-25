import { useState } from 'react';
import { Pause, Play, X, Check, Clock, Gauge, HardDrive } from 'lucide-react';
interface DownloadItem {
  id: string;
  titleId: number;
  name: string;
  progress: number;
  status: 'downloading' | 'paused' | 'completed' | 'queued';
  quality: string;
  size: string;
  speed?: string;
  eta?: string;
  poster: string;
}

const downloads: DownloadItem[] = [
  { id: 'dl1', titleId: 1, name: 'Интерстеллар', progress: 67, status: 'downloading', quality: '4K HDR', size: '14.2 GB', speed: '48 MB/s', eta: '4 мин', poster: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=400&h=600&fit=crop' },
  { id: 'dl2', titleId: 2, name: 'Дюна', progress: 100, status: 'completed', quality: '4K Dolby Vision', size: '22.1 GB', poster: 'https://images.pexels.com/photos/3026904/pexels-photo-3026904.jpeg?auto=compress&cs=tinysrgb&w=400&h=600&fit=crop' },
  { id: 'dl3', titleId: 3, name: 'Бегущий по лезвию 2049', progress: 34, status: 'downloading', quality: '1080p', size: '2.8 GB', speed: '32 MB/s', eta: '1 мин', poster: 'https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=400&h=600&fit=crop' },
];

type FilterStatus = 'all' | 'downloading' | 'completed' | 'paused' | 'queued';

export default function DownloadManager() {
  const [items, setItems] = useState<DownloadItem[]>(downloads);
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filtered = filter === 'all' ? items : items.filter((d) => d.status === filter);
  const active = items.filter((d) => d.status === 'downloading');
  const completed = items.filter((d) => d.status === 'completed');
  const totalSize = items.filter((d) => d.status === 'completed').reduce((sum, d) => {
    const gb = parseFloat(d.size);
    return sum + (isNaN(gb) ? 0 : gb);
  }, 0);

  const toggleStatus = (id: string) => {
    setItems((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      if (d.status === 'downloading') return { ...d, status: 'paused' as const, speed: undefined, eta: undefined };
      if (d.status === 'paused') return { ...d, status: 'downloading' as const, speed: '40 MB/s', eta: '3 min' };
      return d;
    }));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((d) => d.id !== id));
  };

  const filters: { id: FilterStatus; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'downloading', label: 'Downloading', count: active.length },
    { id: 'completed', label: 'Completed', count: completed.length },
    { id: 'paused', label: 'Paused', count: items.filter((d) => d.status === 'paused').length },
    { id: 'queued', label: 'Queued', count: items.filter((d) => d.status === 'queued').length },
  ];

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-8 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Downloads</h1>
          <p className="mt-2 text-[15px] text-white/50">{completed.length} ready offline · {totalSize.toFixed(1)} GB stored</p>
        </div>

        {/* Active summary */}
        {active.length > 0 && (
          <div className="mb-8 glass-panel rounded-[16px] p-5 animate-detail-rise">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-300/10">
                <Gauge className="h-4 w-4 text-amber-300/80" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-medium text-white/85">{active.length} downloading</div>
                <div className="mt-0.5 flex items-center gap-3 text-[12px] text-white/45">
                  <span className="flex items-center gap-1"><Gauge className="h-3 w-3" strokeWidth={1.5} />{active[0].speed}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.5} />{active[0].eta} remaining</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                <HardDrive className="h-3.5 w-3.5" strokeWidth={1.5} />42.8 GB free
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-2 animate-row-reveal">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
              style={{
                background: filter === f.id ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === f.id ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: filter === f.id ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {f.label}<span className="text-[11px] opacity-60">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Queue */}
        <div className="space-y-3 animate-detail-rise" style={{ animationDelay: '100ms' }}>
          {filtered.map((d, i) => (
            <div
              key={d.id}
              className="group flex items-center gap-4 rounded-[14px] glass-panel p-4 animate-stagger-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Poster */}
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-[8px]">
                <img src={d.poster} alt={d.name} className="h-full w-full object-cover" loading="lazy" />
                {d.status === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Check className="h-4 w-4 text-emerald-300" strokeWidth={2} />
                  </div>
                )}
              </div>

              {/* Info + progress */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-[14px] font-medium text-white/85">{d.name}</h3>
                  <span className="shrink-0 text-[11px] text-white/35">{d.quality} · {d.size}</span>
                </div>

                {d.status === 'downloading' && (
                  <>
                    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${d.progress}%`, background: 'linear-gradient(90deg, rgba(232,193,112,0.6), rgba(232,193,112,0.95))' }} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-white/40">
                      <span>{d.progress}%</span>
                      {d.speed && <span className="flex items-center gap-1"><Gauge className="h-3 w-3" strokeWidth={1.5} />{d.speed}</span>}
                      {d.eta && <span className="flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.5} />{d.eta}</span>}
                    </div>
                  </>
                )}

                {d.status === 'completed' && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-300/70">
                    <Check className="h-3 w-3" strokeWidth={2} />Ready to watch offline
                  </div>
                )}

                {d.status === 'paused' && (
                  <>
                    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-white/25" style={{ width: `${d.progress}%` }} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-white/35">Paused at {d.progress}%</div>
                  </>
                )}

                {d.status === 'queued' && (
                  <div className="mt-1.5 text-[11px] text-white/35">Waiting…</div>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                {(d.status === 'downloading' || d.status === 'paused') && (
                  <button onClick={() => toggleStatus(d.id)} className="flex h-9 w-9 items-center justify-center rounded-full glass text-white/70 transition-cinematic hover:bg-white/12 hover:text-white" aria-label={d.status === 'downloading' ? 'Pause' : 'Resume'}>
                    {d.status === 'downloading' ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 fill-current" />}
                  </button>
                )}
                {d.status === 'completed' && (
                  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-cinematic hover:scale-105" aria-label="Play">
                    <Play className="h-4 w-4 fill-current" />
                  </button>
                )}
                <button onClick={() => removeItem(d.id)} className="flex h-9 w-9 items-center justify-center rounded-full glass text-white/50 transition-cinematic hover:bg-red-500/15 hover:text-red-300" aria-label="Remove">
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

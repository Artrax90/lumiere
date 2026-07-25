import { useState } from 'react';
import { Star, Download, ChevronRight, Puzzle, Search, Check } from 'lucide-react';
interface Plugin {
  id: string;
  name: string;
  developer: string;
  description: string;
  category: string;
  rating: number;
  downloads: string;
  version: string;
  icon: string;
  screenshots: string[];
  featured?: boolean;
  installed?: boolean;
}

const plugins: Plugin[] = [
  { id: 'trakt-sync', name: 'Trakt Sync', developer: 'Lumière Labs', description: 'Синхронизация истории просмотров с Trakt.', category: 'Sync', rating: 4.8, downloads: '124K', version: '2.4.1', icon: '🔄', screenshots: [], featured: true, installed: true },
  { id: 'subtitle-finder', name: 'OpenSubtitles', developer: 'Subtitle Collective', description: 'Поиск субтитров на 100+ языках.', category: 'Subtitles', rating: 4.6, downloads: '892K', version: '3.1.0', icon: '💬', screenshots: [], featured: true },
  { id: 'tmdb-metadata', name: 'TMDB Metadata', developer: 'Community', description: 'Метаданные из The Movie Database.', category: 'Metadata', rating: 4.9, downloads: '1.2M', version: '5.0.2', icon: '🎬', screenshots: [], featured: true },
];

const categories = ['Все', 'Синхронизация', 'Субтитры', 'Метаданные', 'Аниме', 'Аудио', 'Воспроизведение'];

export default function PluginStore() {
  const [activeCat, setActiveCat] = useState('All');
  const [installed, setInstalled] = useState<Set<string>>(
    new Set(plugins.filter((p) => p.installed).map((p) => p.id))
  );
  const [selected, setSelected] = useState<Plugin | null>(null);

  const filtered = activeCat === 'All' ? plugins : plugins.filter((p) => p.category === activeCat);
  const featured = plugins.filter((p) => p.featured);

  const toggleInstall = (id: string) => {
    setInstalled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Detail view
  if (selected) {
    return (
      <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12 animate-fade-in">
        <div className="mx-auto max-w-[1000px]">
          <button onClick={() => setSelected(null)} className="mb-8 flex items-center gap-2 text-[13px] font-medium text-white/55 transition-cinematic hover:text-white/90">
            <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={1.5} />Plugin Store
          </button>

          {/* Header */}
          <div className="glass-panel rounded-[20px] p-8 animate-detail-rise">
            <div className="flex items-start gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-white/5 text-[40px]">{selected.icon}</div>
              <div className="flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300/70">{selected.category}</div>
                <h1 className="mt-1 text-display text-[28px] font-medium tracking-tight text-white">{selected.name}</h1>
                <div className="mt-1 flex items-center gap-3 text-[13px] text-white/45">
                  <span>{selected.developer}</span>
                  <span className="text-white/15">·</span>
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-300/70" fill="currentColor" strokeWidth={0} />{selected.rating}</span>
                  <span className="text-white/15">·</span>
                  <span>{selected.downloads} downloads</span>
                </div>
              </div>
              <button
                onClick={() => toggleInstall(selected.id)}
                className="flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold transition-cinematic hover:scale-[1.03] active:scale-95"
                style={{
                  background: installed.has(selected.id) ? 'rgba(255,255,255,0.08)' : 'white',
                  color: installed.has(selected.id) ? 'rgba(255,255,255,0.85)' : 'black',
                }}
              >
                {installed.has(selected.id) ? <><Check className="h-4 w-4" strokeWidth={2} />Installed</> : <><Download className="h-4 w-4" />Install</>}
              </button>
            </div>

            <p className="mt-6 text-[15px] leading-[1.7] text-white/70">{selected.description}</p>

            {/* Screenshots */}
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {selected.screenshots.map((s, i) => (
                <div key={i} className="aspect-video overflow-hidden rounded-[14px] animate-stagger-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <img src={s} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>

            {/* Meta */}
            <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-white/[0.06] pt-6 md:grid-cols-4">
              <div><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Version</div><div className="mt-1 text-[14px] font-medium text-white/85">{selected.version}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Developer</div><div className="mt-1 text-[14px] font-medium text-white/85">{selected.developer}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Category</div><div className="mt-1 text-[14px] font-medium text-white/85">{selected.category}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.14em] text-white/30">Rating</div><div className="mt-1 flex items-center gap-1 text-[14px] font-medium text-white/85"><Star className="h-3 w-3 text-amber-300/70" fill="currentColor" strokeWidth={0} />{selected.rating}</div></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Store front
  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-10 animate-row-reveal">
          <div className="flex items-center gap-3">
            <Puzzle className="h-6 w-6 text-amber-300/70" strokeWidth={1.5} />
            <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Plugin Store</h1>
          </div>
          <p className="mt-2 text-[15px] text-white/50">Extend Lumière with handcrafted plugins.</p>
        </div>

        {/* Featured — large editorial cards */}
        <div className="mb-12 grid gap-5 md:grid-cols-3 animate-row-reveal">
          {featured.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="group relative h-64 overflow-hidden rounded-[18px] text-left transition-all duration-500 ease-out animate-stagger-in card-edge hover:card-edge-hover"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <img src={p.screenshots[0]} alt={p.name} className="absolute inset-0 h-full w-full object-cover transition-cinematic group-hover:scale-105" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute left-4 top-4 rounded-full bg-amber-300/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/90 backdrop-blur-md">Featured</div>
              <div className="absolute bottom-0 left-0 p-6">
                <div className="mb-2 text-[32px]">{p.icon}</div>
                <h2 className="text-display text-[20px] font-medium text-white">{p.name}</h2>
                <p className="mt-1 line-clamp-2 text-[12px] text-white/55">{p.description}</p>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-white/45">
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-300/70" fill="currentColor" strokeWidth={0} />{p.rating}</span>
                  <span className="text-white/15">·</span>
                  <span>{p.downloads}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="mb-8 no-scrollbar flex gap-2 overflow-x-auto animate-row-reveal">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
              style={{
                background: activeCat === c ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: activeCat === c ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: activeCat === c ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Plugin grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="group flex items-center gap-4 rounded-[16px] glass-panel p-4 text-left transition-cinematic hover:bg-white/[0.06] animate-stagger-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-white/5 text-[28px]">{p.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[14px] font-semibold text-white/90">{p.name}</h3>
                  {installed.has(p.id) && <Check className="h-3.5 w-3.5 shrink-0 text-amber-300/80" strokeWidth={2} />}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[12px] text-white/45">{p.description}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/35">
                  <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-300/55" fill="currentColor" strokeWidth={0} />{p.rating}</span>
                  <span className="text-white/15">·</span>
                  <span>{p.downloads}</span>
                  <span className="text-white/15">·</span>
                  <span>{p.category}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition-cinematic group-hover:text-white/60" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

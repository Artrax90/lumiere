import { useState } from 'react';
import { Star, ChevronRight, Play } from 'lucide-react';
import type { Title } from '@/api/client';

const img = (id: string, w = 600, h = 400) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop`;

const liveChannels = [
  { id: 'ch1', name: 'Global News', number: 101, group: 'News', now: 'World News Tonight', next: 'Late Edition', image: img('518544'), favorite: true },
  { id: 'ch2', name: 'Sport+', number: 102, group: 'Sports', now: 'Champions League Final', next: 'Post-Match Analysis', image: img('274506'), favorite: true },
  { id: 'ch3', name: 'Classica', number: 103, group: 'Music', now: 'Berlin Philharmonic Live', next: 'Opera Highlights', image: img('1648572'), favorite: false },
  { id: 'ch4', name: 'Cinema Gold', number: 104, group: 'Movies', now: 'The Grand Budapest Hotel', next: 'Amsterdam', image: img('261101'), favorite: true },
  { id: 'ch5', name: 'Nature HD', number: 105, group: 'Documentary', now: 'Planet Earth III', next: 'Blue Planet II', image: img('1634861'), favorite: false },
  { id: 'ch6', name: 'Anime Wave', number: 106, group: 'Entertainment', now: 'Frieren', next: 'Demon Slayer', image: img('1634861'), favorite: false },
];

interface LiveTVProps {
  onSelect: (title: Title) => void;
  titles: Title[];
}

const hours = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
const channelGroups = ['All', 'News', 'Sports', 'Movies', 'Music', 'Documentary', 'Entertainment'];

export default function LiveTV({ onSelect, titles }: LiveTVProps) {
  const [activeGroup, setActiveGroup] = useState('All');
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(liveChannels.filter((c) => c.favorite).map((c) => c.id))
  );
  const [selectedChannel, setSelectedChannel] = useState(liveChannels[0]);

  const liveTitles = titles.filter((t) => t.type === 'live');
  const channels = activeGroup === 'All' ? liveChannels : liveChannels.filter((c) => c.group === activeGroup);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <div className="mb-8 animate-row-reveal">
          <div className="flex items-center gap-3">
            <div className="flex h-2.5 w-2.5 items-center justify-center">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse-soft" />
            </div>
            <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Live TV</h1>
          </div>
          <p className="mt-2 text-[15px] text-white/50">A modern guide. Select any channel to tune in.</p>
        </div>

        {/* Now Playing preview */}
        <div className="mb-10 animate-detail-rise">
          <div className="glass-panel overflow-hidden rounded-[20px]">
            <div className="grid md:grid-cols-[1fr_320px]">
              {/* Preview area */}
              <div className="relative h-64 md:h-80">
                <img src={selectedChannel.image} alt={selectedChannel.name} className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(1.05) brightness(0.85)' }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" />On Air
                </div>
                <div className="absolute bottom-0 left-0 p-6">
                  <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/50">{selectedChannel.group} · CH {selectedChannel.number}</div>
                  <h2 className="mt-1 text-display text-[24px] font-medium text-white md:text-[28px]">{selectedChannel.name}</h2>
                  <div className="mt-1 text-[14px] text-white/70">{selectedChannel.now}</div>
                  <div className="mt-0.5 text-[12px] text-white/40">Next: {selectedChannel.next}</div>
                </div>
              </div>
              {/* Channel info sidebar */}
              <div className="border-t border-white/[0.06] p-5 md:border-l md:border-t-0">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Up Next on {selectedChannel.name}</div>
                <div className="space-y-3">
                  <div className="rounded-[12px] bg-white/[0.04] p-3">
                    <div className="text-[10px] text-white/40">20:00</div>
                    <div className="text-[13px] font-medium text-white/85">{selectedChannel.now}</div>
                    <div className="mt-1.5 h-[2px] w-2/3 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-1/2 rounded-full bg-red-400/85" />
                    </div>
                  </div>
                  <div className="rounded-[12px] bg-white/[0.02] p-3">
                    <div className="text-[10px] text-white/40">20:30</div>
                    <div className="text-[13px] font-medium text-white/65">{selectedChannel.next}</div>
                  </div>
                  <div className="rounded-[12px] bg-white/[0.02] p-3">
                    <div className="text-[10px] text-white/40">21:00</div>
                    <div className="text-[13px] font-medium text-white/50">Late Show</div>
                  </div>
                </div>
                <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[13px] font-semibold text-black transition-cinematic hover:scale-[1.02]">
                  <Play className="h-3.5 w-3.5 fill-current" />Tune In
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Channel group filters */}
        <div className="mb-6 no-scrollbar flex gap-2 overflow-x-auto animate-row-reveal">
          {channelGroups.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
              style={{
                background: activeGroup === g ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: activeGroup === g ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: activeGroup === g ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* EPG grid */}
        <div className="glass-panel overflow-hidden rounded-[20px] animate-detail-rise" style={{ animationDelay: '100ms' }}>
          {/* Time header */}
          <div className="flex items-center border-b border-white/[0.06] px-5 py-3">
            <div className="w-44 shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Channel</div>
            <div className="flex flex-1">
              {hours.map((h) => (
                <div key={h} className="flex-1 text-[11px] font-medium text-white/40">{h}</div>
              ))}
            </div>
          </div>

          {/* Channels */}
          {channels.map((ch, idx) => (
            <button
              key={ch.id}
              onClick={() => setSelectedChannel(ch)}
              className={`flex w-full items-center px-5 py-4 text-left transition-cinematic hover:bg-white/[0.03] ${selectedChannel.id === ch.id ? 'bg-white/[0.04]' : ''} ${idx !== channels.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
            >
              <div className="flex w-44 shrink-0 items-center gap-3">
                <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-white/5">
                  <img src={ch.image} alt={ch.name} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-white/85">{ch.name}</div>
                  <div className="text-[10px] text-white/40">CH {ch.number} · {ch.group}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(ch.id); }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-cinematic"
                  aria-label="Favorite"
                >
                  <Star
                    className={`h-3.5 w-3.5 transition-cinematic ${favorites.has(ch.id) ? 'fill-amber-300 text-amber-300' : 'text-white/25'}`}
                    strokeWidth={1.5}
                  />
                </button>
              </div>
              <div className="flex flex-1 gap-1">
                <div className="flex-[2] rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2">
                  <div className="truncate text-[12px] font-medium text-white/85">{ch.now}</div>
                  <div className="mt-1 h-0.5 w-2/3 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full w-1/2 rounded-full bg-amber-300/80" />
                  </div>
                </div>
                <div className="flex-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div className="truncate text-[12px] text-white/55">{ch.next}</div>
                </div>
                <div className="flex-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div className="truncate text-[12px] text-white/40">Late Show</div>
                </div>
                <div className="flex-1" />
                <div className="flex-1" />
                <div className="flex-1" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

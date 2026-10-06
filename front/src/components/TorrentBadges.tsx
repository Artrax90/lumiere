import { useMemo } from 'react';
import { parseTorrentMeta, pluralSeeds, type TorrentMetaBadge } from '@/utils/torrentMeta';

interface TorrentBadgesProps {
  title: string;
  voices?: string[];
  sizeFormatted?: string;
  seeders?: number;
  peers?: number;
  tracker?: string;
  resolution?: string;
  channels?: string;
  audioTracks?: Array<{ lang: string; title?: string }>;
  subtitles?: string[];
  bitrate?: string;
  className?: string;
  maxBadges?: number;
}

const badgeColorMap: Record<TorrentMetaBadge['type'] | 'sub' | 'bitrate' | 'tracker', string> = {
  fmt: 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-[0_0_8px_rgba(56,189,248,0.2)] font-extrabold',
  'res-4k': 'bg-amber-400/25 text-amber-300 border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)] font-extrabold',
  'res-1080': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_8px_rgba(16,185,129,0.2)] font-bold',
  'res-720': 'bg-slate-400/15 text-slate-300 border-slate-400/40 font-semibold',
  'res-sd': 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40 font-semibold',
  'hdr-dv': 'bg-fuchsia-500/25 text-fuchsia-200 border-fuchsia-400/60 shadow-[0_0_12px_rgba(192,132,252,0.3)] font-bold',
  hdr: 'bg-purple-500/20 text-purple-300 border-purple-400/50 font-bold',
  codec: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 font-bold',
  color: 'bg-violet-500/20 text-violet-300 border-violet-400/50 font-semibold',
  qual: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/50 font-bold',
  'qual-cam': 'bg-rose-500/25 text-rose-300 border-rose-500/50 font-bold',
  'audio-atmos': 'bg-pink-500/25 text-pink-200 border-pink-400/60 shadow-[0_0_12px_rgba(244,114,182,0.3)] font-bold',
  audio: 'bg-rose-500/20 text-rose-300 border-rose-400/50 font-semibold',
  dub: 'bg-purple-600/30 text-purple-200 border-purple-500/60 shadow-[0_0_8px_rgba(168,85,247,0.25)] font-bold normal-case',
  pack: 'bg-amber-400/15 text-amber-200 border-amber-400/40 font-semibold',
  lang: 'bg-blue-500/20 text-blue-300 border-blue-400/50 font-bold',
  year: 'bg-white/[0.08] text-white/70 border-white/20 font-medium',
  sub: 'bg-slate-400/15 text-slate-300 border-slate-400/35 font-semibold',
  bitrate: 'bg-white/[0.07] text-white/80 border-white/15 font-semibold',
  tracker: 'bg-white/[0.08] text-white/80 border-white/15 font-semibold uppercase tracking-wider',
};

export default function TorrentBadges({
  title,
  voices,
  sizeFormatted,
  seeders,
  peers,
  tracker,
  resolution,
  channels,
  audioTracks,
  subtitles,
  bitrate,
  className = '',
  maxBadges = 12,
}: TorrentBadgesProps) {
  const parsedBadges = useMemo(() => {
    return parseTorrentMeta(title, voices);
  }, [title, voices]);

  // Determine exact resolution badge type
  const exactRes = useMemo(() => {
    if (!resolution) return null;
    let type: TorrentMetaBadge['type'] = 'res-1080';
    const parts = resolution.split(/[xх×]/i);
    if (parts.length === 2) {
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (w >= 3000 || h >= 1600) type = 'res-4k';
      else if (w >= 1800 || h >= 800) type = 'res-1080';
      else if (w >= 1200 || h >= 650) type = 'res-720';
      else type = 'res-sd';
    }
    return { text: resolution, type };
  }, [resolution]);

  // Filter parsed badges to avoid duplicates with rich metadata
  const metaBadges = useMemo(() => {
    return parsedBadges.filter(b => {
      if (exactRes && b.type.startsWith('res-')) return false;
      if (channels && (b.type === 'audio' || b.type === 'audio-atmos')) return false;
      if (audioTracks && audioTracks.length > 0 && b.type === 'dub') return false;
      return true;
    }).slice(0, maxBadges);
  }, [parsedBadges, exactRes, channels, audioTracks, maxBadges]);

  const hasItems =
    tracker ||
    exactRes ||
    metaBadges.length > 0 ||
    channels ||
    (audioTracks && audioTracks.length > 0) ||
    (subtitles && subtitles.length > 0) ||
    bitrate ||
    sizeFormatted ||
    seeders != null;

  if (!hasItems) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* Tracker pill */}
      {tracker && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] leading-tight border ${badgeColorMap.tracker}`}>
          {tracker}
        </span>
      )}

      {/* Resolution: exact or from parsed title */}
      {exactRes && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] tracking-wide border leading-tight ${badgeColorMap[exactRes.type]}`}>
          {exactRes.text}
        </span>
      )}

      {/* Title format, HDR, DV, codec, quality badges */}
      {metaBadges.map((badge, idx) => {
        const colorClasses = badgeColorMap[badge.type] || 'bg-white/10 text-white/70 border-white/15';
        return (
          <span
            key={`${badge.text}-${idx}`}
            className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] tracking-wide border leading-tight ${colorClasses}`}
          >
            {badge.text}
          </span>
        );
      })}

      {/* Audio channels */}
      {channels && (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] tracking-wide border leading-tight ${
            badgeColorMap[channels.toLowerCase().includes('atmos') ? 'audio-atmos' : 'audio']
          }`}
        >
          {channels}
        </span>
      )}

      {/* Audio tracks & studios */}
      {audioTracks && audioTracks.map((tr, idx) => {
        const text = tr.title ? `${tr.lang} · ${tr.title}` : tr.lang;
        return (
          <span
            key={`audio-${tr.lang}-${idx}`}
            className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] tracking-wide border leading-tight ${badgeColorMap.dub}`}
          >
            {text}
          </span>
        );
      })}

      {/* Subtitles */}
      {subtitles && subtitles.map((sub, idx) => (
        <span
          key={`sub-${sub}-${idx}`}
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] tracking-wide border leading-tight ${badgeColorMap.sub}`}
        >
          СУБ: {sub}
        </span>
      ))}

      {/* Bitrate */}
      {bitrate && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] tracking-wide border leading-tight ${badgeColorMap.bitrate}`}>
          {bitrate}
        </span>
      )}

      {/* Size badge */}
      {sizeFormatted && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-white/[0.06] text-white/80 border border-white/15 leading-tight">
          <span>💾</span>
          <span>{sizeFormatted}</span>
        </span>
      )}

      {/* Seeders badge */}
      {seeders != null && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)] leading-tight">
          <span>⚡</span>
          <span>{seeders} {pluralSeeds(seeders)}</span>
        </span>
      )}

      {/* Peers badge */}
      {peers != null && peers > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-white/[0.04] text-white/50 border border-white/10 leading-tight">
          <span>👥</span>
          <span>{peers}</span>
        </span>
      )}
    </div>
  );
}

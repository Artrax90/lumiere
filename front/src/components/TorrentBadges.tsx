import { useMemo } from 'react';
import { parseTorrentMeta, pluralSeeds, type TorrentMetaBadge } from '@/utils/torrentMeta';

interface TorrentBadgesProps {
  title: string;
  sizeFormatted?: string;
  seeders?: number;
  peers?: number;
  tracker?: string;
  className?: string;
  maxBadges?: number;
}

const badgeColorMap: Record<TorrentMetaBadge['type'], string> = {
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
  dub: 'bg-violet-600/25 text-violet-200 border-violet-500/50 font-semibold',
  pack: 'bg-amber-400/15 text-amber-200 border-amber-400/40 font-semibold',
  lang: 'bg-blue-500/20 text-blue-300 border-blue-400/50 font-bold',
  year: 'bg-white/[0.08] text-white/70 border-white/20 font-medium',
};

export default function TorrentBadges({
  title,
  sizeFormatted,
  seeders,
  peers,
  tracker,
  className = '',
  maxBadges = 10,
}: TorrentBadgesProps) {
  const badges = useMemo(() => {
    return parseTorrentMeta(title).slice(0, maxBadges);
  }, [title, maxBadges]);

  const hasExtra = tracker || sizeFormatted || seeders != null;
  if (!badges.length && !hasExtra) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* Tracker tag */}
      {tracker && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-semibold uppercase tracking-wider bg-white/[0.08] text-white/80 border border-white/15 leading-tight">
          {tracker}
        </span>
      )}

      {/* Title format and metadata badges */}
      {badges.map((badge, idx) => {
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

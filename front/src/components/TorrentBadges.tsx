import { useMemo } from 'react';
import { parseTorrentMeta, type TorrentMetaBadge } from '@/utils/torrentMeta';

interface TorrentBadgesProps {
  title: string;
  className?: string;
  maxBadges?: number;
}

const badgeColorMap: Record<TorrentMetaBadge['type'], string> = {
  fmt: 'bg-sky-500/15 text-sky-300 border-sky-500/30 font-semibold',
  'res-4k': 'bg-amber-400/20 text-amber-300 border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.18)] font-semibold',
  'res-1080': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-medium',
  'res-720': 'bg-sky-500/15 text-sky-300 border-sky-500/30 font-medium',
  'res-sd': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30 font-medium',
  'hdr-dv': 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40 shadow-[0_0_10px_rgba(192,132,252,0.18)] font-semibold',
  hdr: 'bg-purple-500/15 text-purple-300 border-purple-500/30 font-medium',
  codec: 'bg-teal-500/15 text-teal-300 border-teal-500/30 font-medium',
  color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  qual: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20',
  'qual-cam': 'bg-red-500/20 text-red-300 border-red-500/30 font-semibold',
  'audio-atmos': 'bg-pink-500/20 text-pink-300 border-pink-500/30 shadow-[0_0_10px_rgba(244,114,182,0.18)] font-semibold',
  audio: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/25',
};

export default function TorrentBadges({ title, className = '', maxBadges = 8 }: TorrentBadgesProps) {
  const badges = useMemo(() => {
    return parseTorrentMeta(title).slice(0, maxBadges);
  }, [title, maxBadges]);

  if (!badges.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map((badge, idx) => {
        const colorClasses = badgeColorMap[badge.type] || 'bg-white/10 text-white/70 border-white/15';
        return (
          <span
            key={`${badge.text}-${idx}`}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] tracking-wide border leading-tight ${colorClasses}`}
          >
            {badge.text}
          </span>
        );
      })}
    </div>
  );
}

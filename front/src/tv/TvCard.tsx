import { useState } from 'react';
import { Play, Star } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverUrl } from '@/api/server';
import Focusable from './Focusable';

interface TvCardProps {
  title: Title;
  focusedId: string | null;
  onSelect: (title: Title) => void;
  index?: number;
}

export default function TvCard({ title, focusedId, onSelect, index = 0 }: TvCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const cardId = `card-${title.id}-${index}`;
  const isFocused = focusedId === cardId;

  return (
    <Focusable
      id={cardId}
      focusedId={focusedId}
      onSelect={() => onSelect(title)}
      className="group relative shrink-0 cursor-pointer"
      focusClass="ring-2 ring-amber-300/80 ring-offset-2 ring-offset-[#050506] scale-[1.05] z-10"
    >
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-[12px]"
        style={{
          width: 200,
          transition: 'transform 200ms ease-out, box-shadow 200ms ease-out',
          boxShadow: isFocused
            ? '0 8px 32px rgba(232,193,112,0.2), 0 0 0 2px rgba(232,193,112,0.3)'
            : '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Skeleton */}
        {!imgLoaded && <div className="absolute inset-0 skeleton rounded-[12px]" />}

        <img
          src={serverUrl(title.poster)}
          alt={title.name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: imgLoaded ? 1 : 0,
            filter: isFocused ? 'saturate(1.1) brightness(1.05)' : 'saturate(0.94) brightness(0.9)',
            transition: 'opacity 400ms ease-out, filter 200ms ease-out',
          }}
        />

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)',
            opacity: isFocused ? 1 : 0.7,
          }}
        />

        {/* Play icon on focus */}
        {isFocused && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
              <Play className="h-5 w-5 text-black fill-black ml-0.5" />
            </div>
          </div>
        )}

        {/* Score badge */}
        {title.score > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-amber-300/90">
            <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} />
            {title.score}
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-2 truncate text-[14px] font-medium text-white/85" style={{ width: 200 }}>
        {title.name}
      </h3>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
        <span>{title.year}</span>
        {title.genres.length > 0 && (
          <>
            <span className="text-white/15">·</span>
            <span className="truncate">{title.genres.slice(0, 2).join(', ')}</span>
          </>
        )}
      </div>
    </Focusable>
  );
}

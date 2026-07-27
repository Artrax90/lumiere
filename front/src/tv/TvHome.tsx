import { useState, useEffect } from 'react';
import type { Title } from '@/api/client';
import { useTrending } from '@/hooks/useTrending';
import { usePopular } from '@/hooks/usePopular';
import { useFocus, type FocusableElement } from './useFocus';
import TvContentRow from './TvContentRow';

interface TvHomeProps {
  onSelect: (title: Title) => void;
  onPlay: (title: Title) => void;
}

export default function TvHome({ onSelect, onPlay }: TvHomeProps) {
  const { data: trendingMovies } = useTrending('movie');
  const { data: popularMovies } = usePopular('movie');
  const { data: trendingTv } = useTrending('tv');

  // Build focus elements grid
  const buildElements = (): FocusableElement[] => {
    const els: FocusableElement[] = [];
    const rows = [
      trendingMovies,
      popularMovies,
      trendingTv,
    ];

    rows.forEach((titles, row) => {
      titles.forEach((_, col) => {
        els.push({
          id: `card-${titles[col]?.id}-${col}`,
          row,
          col,
          onSelect: () => onSelect(titles[col]),
        });
      });
    });

    return els;
  };

  const { focusedId } = useFocus({
    elements: buildElements(),
    initialFocus: trendingMovies[0] ? `card-${trendingMovies[0].id}-0` : undefined,
  });

  return (
    <div className="min-h-screen pt-6 pb-20">
      {/* Hero banner */}
      {trendingMovies[0] && (
        <div className="relative mb-8 h-[40vh] w-full overflow-hidden rounded-[16px] mx-8" style={{ width: 'calc(100% - 64px)' }}>
          <img
            src={trendingMovies[0].backdrop}
            alt={trendingMovies[0].name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: 'brightness(0.7)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050506] via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-8">
            <h1 className="text-display text-[36px] font-medium text-white/95 mb-2">
              {trendingMovies[0].name}
            </h1>
            <p className="text-[14px] text-white/55 max-w-[500px] line-clamp-2">
              {trendingMovies[0].description}
            </p>
          </div>
        </div>
      )}

      {/* Content rows */}
      <TvContentRow
        label="В тренде"
        subtitle="Самое популярное прямо сейчас"
        titles={trendingMovies}
        onSelect={onSelect}
        focusedId={focusedId}
        rowIndex={0}
      />

      <TvContentRow
        label="Популярные фильмы"
        titles={popularMovies}
        onSelect={onSelect}
        focusedId={focusedId}
        rowIndex={1}
      />

      <TvContentRow
        label="Популярные сериалы"
        titles={trendingTv}
        onSelect={onSelect}
        focusedId={focusedId}
        rowIndex={2}
      />
    </div>
  );
}

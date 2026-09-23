import { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Star, Film } from 'lucide-react';
import { serverFetch } from '@/api/server';
import type { Title } from '@/api/client';
import SafeImg from './SafeImg';

interface PersonCredit {
  id: number;
  title: string;
  type: 'movie' | 'tv';
  poster: string;
  backdrop: string;
  year: number;
  score: number;
  character?: string;
  job?: string;
}

interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  profile: string;
  birthday?: string;
  placeOfBirth?: string;
  credits: PersonCredit[];
}

interface PersonModalProps {
  personId: number | null;
  onClose: () => void;
  onSelectMovie: (title: Title) => void;
}

export default function PersonModal({ personId, onClose, onSelectMovie }: PersonModalProps) {
  const [data, setData] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    serverFetch(`/api/catalog/person/${personId}`)
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
      })
      .catch((err) => {
        console.error('Failed to load person:', err);
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [personId]);

  useEffect(() => {
    if (!personId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 10009) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [personId, onClose]);

  if (!personId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#10121a]/95 shadow-2xl backdrop-blur-2xl">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Персона</span>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-all hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-6 sm:px-8">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            </div>
          ) : !data ? (
            <div className="py-12 text-center text-white/50">Не удалось загрузить информацию о персоне</div>
          ) : (
            <div>
              {/* Profile Top: Avatar + Bio */}
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="h-48 w-36 shrink-0 overflow-hidden rounded-2xl bg-white/5 ring-2 ring-white/10 shadow-lg mx-auto sm:mx-0">
                  <SafeImg
                    src={data.profile}
                    alt={data.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{data.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-xs text-white/60">
                    {data.birthday && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-amber-300/80" />
                        {data.birthday}
                      </span>
                    )}
                    {data.placeOfBirth && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-amber-300/80" />
                        {data.placeOfBirth}
                      </span>
                    )}
                  </div>
                  {data.biography ? (
                    <p className="mt-4 text-xs leading-relaxed text-white/70 max-h-32 overflow-y-auto pr-2">
                      {data.biography}
                    </p>
                  ) : (
                    <p className="mt-4 text-xs italic text-white/40">Биография отсутствует</p>
                  )}
                </div>
              </div>

              {/* Filmography Section */}
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Film className="h-4 w-4 text-amber-300" />
                    Фильмография
                  </h3>
                  <span className="rounded-full bg-amber-400/20 px-3 py-0.5 text-xs font-semibold text-amber-300">
                    {data.credits?.length || 0} тайтлов
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {data.credits?.map((credit) => (
                    <div
                      key={`${credit.type}-${credit.id}`}
                      onClick={() => {
                        onClose();
                        onSelectMovie({
                          id: credit.id,
                          name: credit.title,
                          type: credit.type,
                          poster: credit.poster,
                          backdrop: credit.backdrop || credit.poster,
                          year: credit.year,
                          score: credit.score,
                          genres: [],
                          runtime: '',
                          rating: '',
                          description: '',
                          logoText: credit.title,
                        });
                      }}
                      className="group cursor-pointer flex flex-col rounded-xl overflow-hidden border border-white/10 bg-white/5 transition-all hover:scale-105 hover:border-amber-400/50 hover:bg-white/10 hover:shadow-lg hover:shadow-amber-400/10"
                    >
                      <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/40">
                        <SafeImg
                          src={credit.poster}
                          alt={credit.title}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        {credit.score > 0 && (
                          <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                            <Star className="h-2.5 w-2.5 fill-current" />
                            {credit.score}
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 flex flex-col">
                        <div className="truncate text-xs font-bold text-white group-hover:text-amber-300">
                          {credit.title}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] text-white/50">
                          <span>{credit.year || '—'}</span>
                          <span className="truncate max-w-[90px]">{credit.character || credit.job || ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

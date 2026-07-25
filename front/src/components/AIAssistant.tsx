import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Mic } from 'lucide-react';
import type { Title } from '@/api/client';

const mockTitles: Title[] = [
  { id: 1, tmdbId: 1, name: 'Интерстеллар', type: 'movie', year: 2014, runtime: '2h 49m', rating: 'PG-13', score: 8.6, genres: ['Sci-Fi', 'Drama'], description: 'Команда исследователей путешествует через червоточину в космосе.', backdrop: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Интерстеллар' },
  { id: 2, tmdbId: 2, name: 'Дюна', type: 'movie', year: 2024, runtime: '2h 46m', rating: 'PG-13', score: 8.7, genres: ['Sci-Fi', 'Epic'], description: 'Пол Атрейдес объединяется с фременами.', backdrop: 'https://images.pexels.com/photos/3026904/pexels-photo-3026904.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/3026904/pexels-photo-3026904.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Дюна' },
  { id: 3, tmdbId: 3, name: 'Бегущий по лезвию 2049', type: 'movie', year: 2017, runtime: '2h 44m', rating: 'R', score: 8.0, genres: ['Sci-Fi', 'Neo-Noir'], description: 'Молодой Бегущий по лезвию обнаруживает тайну.', backdrop: 'https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Бегущий по лезвию 2049' },
];

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
  onSelect: (title: Title) => void;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
  suggestions?: Title[];
}

const seedSuggestions = mockTitles.slice(0, 3);

const aiResponses: { match: string[]; reply: string; ids: string[] }[] = [
  { match: ['sci-fi', 'space', 'interstellar'], reply: 'For a cinematic sci-fi evening, I\'d suggest these. Each one explores space, time, and human endurance in a distinct way.', ids: ['interstellar', 'dune', 'arrival', 'blade-runner'] },
  { match: ['funny', 'comedy', 'feel-good'], reply: 'Here are a few feel-good picks to lift the mood — warm, witty, and beautifully made.', ids: ['the-grand-budapest', 'amsterdam', 'parasite'] },
  { match: ['anime'], reply: 'These are standout anime right now — both critically acclaimed and visually stunning.', ids: ['frieren', 'demon-slayer'] },
  { match: ['documentary', 'nature'], reply: 'A few documentaries I think you\'ll love — immersive, calming, and visually breathtaking.', ids: ['planet-iii', 'blue-planet', 'cosmos'] },
  { match: ['tonight', 'recommend', 'watch'], reply: 'Based on what you\'ve watched recently, these feel right for tonight.', ids: ['dune', 'severance', 'frieren', 'oppenheimer'] },
];

const fallback = { reply: 'I can help you discover something to watch, explain a plot, build a playlist, or tune the experience. Try asking for a mood, genre, or actor.', ids: [] };

export default function AIAssistant({ open, onClose, onSelect }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: 'Good evening, Alex. Looking for something to watch tonight?',
      suggestions: seedSuggestions,
    },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', text };
    const q = text.toLowerCase();
    const found = aiResponses.find((r) => r.match.some((m) => q.includes(m)));
    const reply = found || fallback;
    const aiMsg: Message = {
      role: 'ai',
      text: reply.reply,
      suggestions: reply.ids.length ? mockTitles.slice(0, 3) : undefined,
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-[91] w-full max-w-md animate-slide-in-right">
        <div className="flex h-full flex-col glass-strong border-l border-white/10">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-7 w-7 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-amber-300/20 blur-md" />
                <Sparkles className="relative h-4 w-4 text-amber-300" strokeWidth={1.5} />
              </div>
              <span className="text-display text-[17px] font-medium text-white/95">Lumière Assistant</span>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-cinematic hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-2 no-scrollbar">
            <div className="space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-amber-300/15 px-4 py-2.5 text-[14px] text-white/90 border border-amber-300/10">
                      {msg.text}
                    </div>
                  ) : (
                    <div className="max-w-[90%]">
                      <div className="rounded-2xl rounded-tl-md glass px-4 py-3 text-[14px] leading-relaxed text-white/80">
                        {msg.text}
                      </div>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar pb-1">
                          {msg.suggestions.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => { onSelect(t); onClose(); }}
                              className="group/shrink w-28 shrink-0 text-left"
                            >
                              <div className="aspect-[2/3] overflow-hidden rounded-lg">
                                <img
                                  src={t.poster}
                                  alt={t.name}
                                  className="h-full w-full object-cover transition-cinematic group-hover/shrink:scale-105"
                                  loading="lazy"
                                />
                              </div>
                              <div className="mt-1.5 truncate text-[11px] font-medium text-white/70">{t.name}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick prompts */}
          <div className="px-6 pb-3">
            <div className="flex flex-wrap gap-2">
              {['Recommend something for tonight', 'Mind-bending sci-fi', 'Short comedy', 'Anime'].map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/55 transition-cinematic hover:bg-white/8 hover:text-white/85"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-6 pb-6 pt-2">
            <div className="flex items-center gap-2 rounded-full glass-panel px-4 py-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(input)}
                placeholder="Ask for a recommendation…"
                className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
              />
              <button className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition-cinematic hover:text-white/80" aria-label="Voice">
                <Mic className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => send(input)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-300/90 text-black transition-cinematic hover:scale-105"
                aria-label="Send"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

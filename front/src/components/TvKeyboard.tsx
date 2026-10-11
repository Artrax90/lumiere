import { useState, useCallback } from 'react';
import { Delete, X, Globe, Hash, CornerDownLeft } from 'lucide-react';

export interface TvKeyboardProps {
  onInput: (char: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onSubmit?: () => void;
  presets?: string[];
  submitLabel?: string;
  className?: string;
}

export default function TvKeyboard({
  onInput,
  onBackspace,
  onClear,
  onSubmit,
  presets,
  submitLabel,
  className = '',
}: TvKeyboardProps) {
  const [layout, setLayout] = useState<'en' | 'ru' | 'sym'>('en');
  const [isShift, setIsShift] = useState(false);

  const numRow = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  const enRows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '-'],
  ];

  const ruRows = [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '.', '-'],
  ];

  const symRows = [
    ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
    ['-', '_', '+', '=', '[', ']', '{', '}', ':', ';'],
    ['"', "'", '<', '>', '?', '/', '\\', '|', '~', '.'],
  ];

  const currentRows = layout === 'sym' ? symRows : layout === 'ru' ? ruRows : enRows;

  const handleKeyClick = (char: string) => {
    let out = char;
    if (layout !== 'sym') {
      out = isShift ? char.toUpperCase() : char.toLowerCase();
    }
    onInput(out);
  };

  const toggleLanguage = () => {
    if (layout === 'sym') {
      setLayout('en');
    } else if (layout === 'en') {
      setLayout('ru');
    } else {
      setLayout('en');
    }
  };

  const toggleSymbols = () => {
    if (layout === 'sym') {
      setLayout('en');
    } else {
      setLayout('sym');
    }
  };

  return (
    <div
      className={`rounded-2xl bg-[#0e1017]/90 border border-white/[0.08] p-2.5 sm:p-3 backdrop-blur-2xl select-none shadow-2xl ${className}`}
    >
      {/* Presets bar (if provided) */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 pb-2 border-b border-white/[0.06]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 mr-1">
            Быстро:
          </span>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onInput(preset)}
              className="py-0.5 px-2 rounded-md bg-white/[0.05] hover:bg-white/[0.12] focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 focus:scale-105 border border-white/[0.08] text-[11px] font-mono text-amber-300 transition-all outline-none cursor-pointer active:scale-95"
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {/* Main Keyboard Grid */}
      <div className="space-y-1">
        {/* Row 1: Numbers */}
        <div className="flex justify-center gap-1">
          {numRow.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleKeyClick(n)}
              className="h-8 sm:h-8.5 flex-1 max-w-[40px] rounded-lg bg-white/[0.05] hover:bg-white/[0.12] focus:bg-amber-400 focus:text-black focus:border-amber-300 focus:ring-2 focus:ring-amber-300 focus:scale-110 border border-white/[0.07] text-xs sm:text-[13px] font-mono font-medium text-white transition-all outline-none cursor-pointer active:scale-95"
            >
              {n}
            </button>
          ))}
        </div>

        {/* Rows 2, 3, 4: Letters or Symbols */}
        {currentRows.map((row, rIdx) => (
          <div key={rIdx} className="flex justify-center gap-1">
            {row.map((char) => {
              const displayChar =
                layout !== 'sym' && isShift ? char.toUpperCase() : char;
              return (
                <button
                  key={char}
                  type="button"
                  onClick={() => handleKeyClick(char)}
                  className="h-8 sm:h-8.5 flex-1 max-w-[40px] rounded-lg bg-white/[0.05] hover:bg-white/[0.12] focus:bg-amber-400 focus:text-black focus:border-amber-300 focus:ring-2 focus:ring-amber-300 focus:scale-110 border border-white/[0.07] text-xs sm:text-[13px] font-medium text-white transition-all outline-none cursor-pointer active:scale-95"
                >
                  {displayChar}
                </button>
              );
            })}
          </div>
        ))}

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-center gap-1 pt-0.5">
          {/* Shift */}
          <button
            type="button"
            onClick={() => setIsShift(!isShift)}
            className={`h-8 sm:h-8.5 px-2.5 rounded-lg text-xs font-semibold transition-all outline-none cursor-pointer active:scale-95 focus:ring-2 focus:ring-amber-300 focus:scale-105 border ${
              isShift
                ? 'bg-amber-400 text-black border-amber-300 shadow-sm shadow-amber-400/20'
                : 'bg-white/[0.06] text-white/80 border-white/[0.08] hover:bg-white/[0.12]'
            }`}
          >
            ⇧ CAPS
          </button>

          {/* RU / EN Toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="h-8 sm:h-8.5 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 focus:scale-105 border border-white/[0.08] text-xs font-semibold text-amber-300 flex items-center gap-1 transition-all outline-none cursor-pointer active:scale-95"
          >
            <Globe className="h-3 w-3" />
            <span>{layout === 'ru' ? 'RU' : 'EN'}</span>
          </button>

          {/* 123 / Symbols Toggle */}
          <button
            type="button"
            onClick={toggleSymbols}
            className={`h-8 sm:h-8.5 px-2.5 rounded-lg text-xs font-semibold transition-all outline-none cursor-pointer active:scale-95 focus:ring-2 focus:ring-amber-300 focus:scale-105 border ${
              layout === 'sym'
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-white/[0.06] text-white/80 border-white/[0.08] hover:bg-white/[0.12]'
            }`}
          >
            {layout === 'sym' ? 'ABC' : '?123'}
          </button>

          {/* Space */}
          <button
            type="button"
            onClick={() => onInput(' ')}
            className="h-8 sm:h-8.5 flex-1 max-w-[130px] rounded-lg bg-white/[0.05] hover:bg-white/[0.12] focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 focus:scale-105 border border-white/[0.08] text-xs font-medium text-white/70 transition-all outline-none cursor-pointer active:scale-95"
          >
            Пробел
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={onBackspace}
            className="h-8 sm:h-8.5 px-3 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 focus:scale-105 border border-white/[0.08] text-amber-300 transition-all outline-none cursor-pointer active:scale-95"
            title="Стереть символ"
            aria-label="Стереть"
          >
            <Delete className="h-3.5 w-3.5 pointer-events-none" />
          </button>

          {/* Clear */}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="h-8 sm:h-8.5 px-2.5 rounded-lg bg-white/[0.05] hover:bg-red-500/20 focus:ring-2 focus:ring-red-400 focus:scale-105 border border-white/[0.08] text-white/50 hover:text-red-300 transition-all outline-none cursor-pointer active:scale-95"
              title="Очистить всё"
              aria-label="Очистить всё"
            >
              <X className="h-3.5 w-3.5 pointer-events-none" />
            </button>
          )}

          {/* Optional Submit button on keyboard */}
          {onSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              className="h-8 sm:h-8.5 px-3.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 text-black font-bold text-xs flex items-center gap-1 transition-all outline-none cursor-pointer active:scale-95 focus:ring-2 focus:ring-amber-300 shadow-sm shadow-amber-400/20"
            >
              <CornerDownLeft className="h-3 w-3 text-black" />
              <span>{submitLabel || 'Ввод'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

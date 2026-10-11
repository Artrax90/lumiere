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
      className={`rounded-[20px] bg-white/[0.03] border border-white/[0.08] p-3 sm:p-4 backdrop-blur-xl select-none ${className}`}
    >
      {/* Presets bar (if provided) */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pb-2.5 border-b border-white/[0.06]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mr-1">
            Быстро:
          </span>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onInput(preset)}
              className="py-1 px-2.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.14] focus:bg-amber-400/25 focus:ring-2 focus:ring-amber-400 focus:scale-105 border border-white/[0.08] text-[12px] font-mono text-amber-200 transition-all outline-none cursor-pointer active:scale-95"
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {/* Main Keyboard Grid */}
      <div className="space-y-1.5">
        {/* Row 1: Numbers */}
        <div className="flex justify-center gap-1 sm:gap-1.5">
          {numRow.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleKeyClick(n)}
              className="h-10 sm:h-11 flex-1 max-w-[48px] rounded-[10px] bg-white/[0.05] hover:bg-white/[0.14] focus:bg-amber-400/30 focus:ring-2 focus:ring-amber-400 focus:border-amber-300 focus:scale-110 border border-white/[0.07] text-[15px] font-mono font-medium text-white transition-all outline-none cursor-pointer active:scale-95"
            >
              {n}
            </button>
          ))}
        </div>

        {/* Rows 2, 3, 4: Letters or Symbols */}
        {currentRows.map((row, rIdx) => (
          <div key={rIdx} className="flex justify-center gap-1 sm:gap-1.5">
            {row.map((char) => {
              const displayChar =
                layout !== 'sym' && isShift ? char.toUpperCase() : char;
              return (
                <button
                  key={char}
                  type="button"
                  onClick={() => handleKeyClick(char)}
                  className="h-10 sm:h-11 flex-1 max-w-[48px] rounded-[10px] bg-white/[0.05] hover:bg-white/[0.14] focus:bg-amber-400/30 focus:ring-2 focus:ring-amber-400 focus:border-amber-300 focus:scale-110 border border-white/[0.07] text-[15px] font-medium text-white transition-all outline-none cursor-pointer active:scale-95"
                >
                  {displayChar}
                </button>
              );
            })}
          </div>
        ))}

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {/* Shift */}
          <button
            type="button"
            onClick={() => setIsShift(!isShift)}
            className={`h-10 sm:h-11 px-3 rounded-[10px] text-[13px] font-semibold transition-all outline-none cursor-pointer active:scale-95 focus:ring-2 focus:ring-amber-400 focus:scale-105 border ${
              isShift
                ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-400/20'
                : 'bg-white/[0.07] text-white/90 border-white/[0.08] hover:bg-white/[0.14]'
            }`}
          >
            ⇧ CAPS
          </button>

          {/* RU / EN Toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="h-10 sm:h-11 px-3 rounded-[10px] bg-white/[0.07] hover:bg-white/[0.14] focus:bg-amber-400/25 focus:ring-2 focus:ring-amber-400 focus:scale-105 border border-white/[0.08] text-[12px] font-semibold text-amber-300 flex items-center gap-1 transition-all outline-none cursor-pointer active:scale-95"
          >
            <Globe className="h-3.5 w-3.5 text-amber-300" />
            <span>{layout === 'ru' ? 'RU' : 'EN'}</span>
          </button>

          {/* 123 / Symbols Toggle */}
          <button
            type="button"
            onClick={toggleSymbols}
            className={`h-10 sm:h-11 px-3 rounded-[10px] text-[12px] font-semibold transition-all outline-none cursor-pointer active:scale-95 focus:ring-2 focus:ring-amber-400 focus:scale-105 border ${
              layout === 'sym'
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-white/[0.07] text-white/90 border-white/[0.08] hover:bg-white/[0.14]'
            }`}
          >
            {layout === 'sym' ? 'ABC' : '?123'}
          </button>

          {/* Space */}
          <button
            type="button"
            onClick={() => onInput(' ')}
            className="h-10 sm:h-11 flex-1 max-w-[160px] rounded-[10px] bg-white/[0.06] hover:bg-white/[0.14] focus:bg-amber-400/25 focus:ring-2 focus:ring-amber-400 focus:scale-105 border border-white/[0.08] text-[12px] font-medium text-white/70 transition-all outline-none cursor-pointer active:scale-95"
          >
            Пробел
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={onBackspace}
            className="h-10 sm:h-11 px-3.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.16] focus:bg-amber-400/25 focus:ring-2 focus:ring-amber-400 focus:scale-105 border border-white/[0.08] text-amber-300 transition-all outline-none cursor-pointer active:scale-95"
            title="Стереть символ"
            aria-label="Стереть"
          >
            <Delete className="h-4 w-4 pointer-events-none" />
          </button>

          {/* Clear */}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="h-10 sm:h-11 px-3 rounded-[10px] bg-white/[0.06] hover:bg-red-500/20 focus:ring-2 focus:ring-red-400 focus:scale-105 border border-white/[0.08] text-white/50 hover:text-red-300 transition-all outline-none cursor-pointer active:scale-95"
              title="Очистить всё"
              aria-label="Очистить всё"
            >
              <X className="h-4 w-4 pointer-events-none" />
            </button>
          )}

          {/* Optional Submit button on keyboard */}
          {onSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              className="h-10 sm:h-11 px-4 rounded-[10px] bg-gradient-to-r from-amber-400 to-amber-500 text-black font-semibold text-[13px] flex items-center gap-1.5 transition-all outline-none cursor-pointer active:scale-95 focus:ring-4 focus:ring-amber-300"
            >
              <CornerDownLeft className="h-3.5 w-3.5 text-black" />
              <span>{submitLabel || 'Ввод'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

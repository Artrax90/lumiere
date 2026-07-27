import { type ReactNode } from 'react';

interface FocusableProps {
  id: string;
  focusedId: string | null;
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
  focusClass?: string;
  as?: keyof JSX.IntrinsicElements;
}

export default function Focusable({
  id,
  focusedId,
  children,
  onSelect,
  className = '',
  focusClass = 'ring-2 ring-amber-300/80 ring-offset-2 ring-offset-[#050506] scale-[1.03]',
  as: Tag = 'div',
}: FocusableProps) {
  const isFocused = focusedId === id;

  return (
    <Tag
      data-focus-id={id}
      tabIndex={isFocused ? 0 : -1}
      className={`${className} ${isFocused ? focusClass : ''} outline-none transition-all duration-200`}
      onClick={onSelect}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          onSelect?.();
          e.preventDefault();
        }
      }}
    >
      {children}
    </Tag>
  );
}

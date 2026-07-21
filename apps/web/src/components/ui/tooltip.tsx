import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Tooltip leve (CSS puro, sem dependência). Mostra no hover/focus (desktop) e
 * também no TOQUE/clique (mobile) — fecha ao tocar fora. Para dicas de campo,
 * use <HintTip> abaixo.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // fecha ao tocar/clicar fora (mobile, onde não há mouseleave)
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const pos: Record<Side, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      ref={ref}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {children}
      {open && content && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-[260px] rounded-lg border border-border-strong bg-surface-3 px-2.5 py-1.5 text-xs font-normal leading-snug text-fg shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            pos[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** Ícone de ajuda com tooltip — para explicar campos e colunas. Tocável em mobile. */
export function HintTip({ content, side = 'top' }: { content: ReactNode; side?: Side }) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label="Ajuda"
        className="inline-flex cursor-help text-fg-subtle transition-colors hover:text-primary"
        onClick={(e) => e.preventDefault()}
      >
        <HelpCircle size={13} />
      </button>
    </Tooltip>
  );
}

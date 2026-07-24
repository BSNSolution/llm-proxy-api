import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/** Modal centralizado, backdrop com blur. Fecha ao clicar fora, no X ou com Esc. */
export function Modal({
  title,
  children,
  onClose,
  size = 'md',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg';
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // a11y: fecha no Esc e move o foco para o modal ao abrir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // foca o primeiro campo/botão do modal (ou o próprio container)
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? dialogRef.current)?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={cn(
          'animate-fade-in-up w-full rounded-xl border border-border-strong bg-surface-2 p-5 shadow-lg outline-none',
          size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 text-fg-subtle transition-colors hover:text-fg"
            aria-label="Fechar"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

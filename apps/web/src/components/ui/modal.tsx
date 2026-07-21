import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/** Modal centralizado, backdrop com blur, fecha ao clicar fora ou no X. */
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
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          'animate-fade-in-up w-full rounded-xl border border-border-strong bg-surface-2 p-5 shadow-lg',
          size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold">{title}</h3>
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

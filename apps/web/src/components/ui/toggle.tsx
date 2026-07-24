import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/** Checkbox customizado com animação de check. */
export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex select-none items-center gap-2.5 text-sm',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border outline-none transition-all duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-primary/50',
          checked
            ? 'border-primary bg-primary text-primary-fg'
            : 'border-border-strong bg-surface-2 hover:border-fg-subtle',
        )}
      >
        <Check
          size={12}
          strokeWidth={3}
          className={cn('transition-transform duration-150', checked ? 'scale-100' : 'scale-0')}
        />
      </button>
      {label && <span className="text-fg-muted">{label}</span>}
    </label>
  );
}

/** Switch (toggle) animado. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex select-none items-center gap-2.5 text-sm',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-200 ease-smooth outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          checked ? 'border-primary bg-primary' : 'border-border-strong bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-smooth',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
          )}
        />
      </button>
      {label && <span className="text-fg-muted">{label}</span>}
    </label>
  );
}

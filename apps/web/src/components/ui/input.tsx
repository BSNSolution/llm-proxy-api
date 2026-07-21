import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn.js';

const base =
  'w-full rounded border border-border bg-surface-2 text-sm text-fg placeholder:text-fg-subtle transition-all duration-150 ease-smooth outline-none focus:border-primary/60 focus:bg-surface-3 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** ícone à esquerda (ex.: <Search size={15} />) */
  icon?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, invalid, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
            {icon}
          </span>
          <input
            ref={ref}
            className={cn(
              base,
              'h-10 pl-9 pr-3',
              invalid && 'border-err/60 focus:border-err/60 focus:ring-err/15',
              className,
            )}
            {...props}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        className={cn(
          base,
          'h-10 px-3',
          invalid && 'border-err/60 focus:border-err/60 focus:ring-err/15',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(base, 'min-h-[80px] resize-y px-3 py-2.5 leading-relaxed', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('text-[13px] font-medium text-fg-muted', className)}>
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-center gap-1.5">
          <Label>{label}</Label>
          {hint}
        </div>
      )}
      {children}
      {error && <p className="text-xs text-err">{error}</p>}
    </div>
  );
}

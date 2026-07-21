import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded font-medium outline-none transition-all duration-150 ease-smooth focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]',
  {
    variants: {
      variant: {
        // sólido roxo com brilho sutil na borda
        primary:
          'bg-primary text-primary-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:brightness-110',
        // superfície elevada — ação secundária padrão
        secondary:
          'border border-border-strong bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3',
        // contorno
        outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-2',
        // fantasma — ícones e ações discretas
        ghost: 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
        // destrutivo
        danger: 'border border-err/40 bg-err/10 text-err hover:bg-err/20',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

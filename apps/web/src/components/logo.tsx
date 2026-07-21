import { cn } from '../lib/cn.js';

/**
 * Marca própria "LLM Proxy" — símbolo (dois nós conectados = proxy roteando)
 * + wordmark. Identidade dev-tool premium.
 */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          LLM <span className="text-fg-muted">Proxy</span>
        </span>
      )}
    </div>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-[rgb(90_50_200)] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* nó esquerdo → hub central → nó direito (roteamento do proxy) */}
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M7 12h4M13 12l4-5M13 12l4 5" />
      </svg>
    </span>
  );
}

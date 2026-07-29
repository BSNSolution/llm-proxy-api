import { Languages } from 'lucide-react';
import { useI18n, type Lang } from '../lib/i18n/index.js';
import { cn } from '../lib/cn.js';

/** Alterna o idioma do painel (pt/en). Compacto, para a barra lateral/rodapé. */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const langs: { code: Lang; label: string }[] = [
    { code: 'pt', label: 'PT' },
    { code: 'en', label: 'EN' },
  ];
  return (
    <div className={cn('inline-flex items-center gap-1 text-xs', className)}>
      <Languages size={13} className="text-fg-subtle" />
      {langs.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={cn(
            'rounded px-1.5 py-0.5 font-medium transition-colors',
            lang === l.code ? 'bg-surface-3 text-fg' : 'text-fg-subtle hover:text-fg',
          )}
          aria-pressed={lang === l.code}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// i18n mínimo e sem dependências: dicionário chave→string por idioma, hook useT,
// provider com o idioma persistido (preferência de UI → localStorage é ok aqui).
// Default pt-BR. Interpolação simples com {var}.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { pt } from './pt.js';
import { en } from './en.js';

export type Lang = 'pt' | 'en';
export type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = { pt, en };
const STORAGE_KEY = 'llmp_lang';

function detectInitial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  // navegador em inglês → en; senão pt (default do produto).
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'pt';
  return nav.startsWith('en') ? 'en' : 'pt';
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en';
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      // fallback: idioma atual → pt → a própria chave (nunca quebra a UI).
      let s = DICTS[lang][key] ?? DICTS.pt[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n deve ser usado dentro de <I18nProvider>');
  return ctx;
}

/** Atalho: só a função de tradução. */
export function useT(): I18nCtx['t'] {
  return useI18n().t;
}

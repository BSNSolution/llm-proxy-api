import type { CliKind } from '@llm-proxy/shared-types';
import { currentOs } from '../platform/index.js';
import { getSetupRecipe } from './recipes.js';
import type { InstallStep, LoginMethod } from './types.js';

/** Steps de instalação aplicáveis ao SO atual (ordenados: preferido primeiro). */
export function getInstallSteps(kind: CliKind): InstallStep[] {
  const recipe = getSetupRecipe(kind);
  const os = currentOs();
  return recipe.install.byOs[os] ?? recipe.install.byOs.linux ?? [];
}

/** Comando legível de um step (para exibir na UI antes de confirmar). */
export function stepToCommandString(step: InstallStep): string {
  // Steps via script embrulham o comando real em `bash -c "<cmd>"` /
  // `powershell -Command "<cmd>"`. Para a UI, mostramos o comando efetivo.
  if (step.viaScript) {
    const last = step.args[step.args.length - 1];
    if (last) return last;
  }
  return `${step.command} ${step.args.join(' ')}`.trim();
}

/**
 * "Plano" de setup exibido ao usuário ANTES de rodar qualquer coisa: qual
 * comando será executado, notas, e como será o login. Nada é executado aqui.
 */
export interface SetupPlan {
  kind: CliKind;
  os: ReturnType<typeof currentOs>;
  /** comandos candidatos (o installer tenta em ordem até um funcionar) */
  commands: { label: string; command: string; viaScript: boolean }[];
  /** false = sem receita de instalação para este SO (ex.: Grok no Windows) */
  installable: boolean;
  installNote?: string;
  login: {
    method: LoginMethod;
    hint?: string;
    apiKeyEnv?: string;
    /** true se dá para logar só com API key/env (sem OAuth interativo) */
    supportsApiKey: boolean;
  };
}

export function getSetupPlan(kind: CliKind): SetupPlan {
  const recipe = getSetupRecipe(kind);
  const steps = getInstallSteps(kind);
  return {
    kind,
    os: currentOs(),
    commands: steps.map((s) => ({
      label: s.label,
      command: stepToCommandString(s),
      viaScript: s.viaScript ?? false,
    })),
    installable: steps.length > 0,
    installNote: recipe.install.note,
    login: {
      method: recipe.login.method,
      hint: recipe.login.hint,
      apiKeyEnv: recipe.login.apiKeyEnv,
      supportsApiKey: !!recipe.login.apiKeyEnv,
    },
  };
}

import type { CliKind } from '@llm-proxy/shared-types';
import type { InstallStep, LoginEvent, SetupRecipe } from './types.js';

/**
 * Receitas REAIS de instalação e login das 6 CLIs core.
 * Fontes: AI/NOTES/17_07_2026-receitas_install_login_claude_codex_gemini.md
 *       + AI/NOTES/17_07_2026-receitas_install_login_cursor_opencode_antigravity.md
 *
 * Princípios:
 * - Comandos/args são FIXOS (nunca interpolar input do usuário).
 * - Install por SO com fallbacks ordenados (preferido primeiro).
 * - Sucesso do login detectado por ARQUIVO de credencial e/ou comando de status
 *   (mais robusto que string de stdout — vários OAuth não são documentados verbatim).
 * - NÃO inventar regex de URL onde não há doc; usar padrão genérico como fallback.
 */

// ---- padrões genéricos de extração (fallback quando não há doc verbatim) ----
const RE_URL = /(https?:\/\/[^\s'"]+)/i;
const RE_DEVICE_CODE = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/;
const RE_SUCCESS = /(login successful|logged in|signed in as|authentication successful|loaded cached credentials)/i;

/** Parser genérico: extrai URL de auth, device code e sucesso de uma linha. */
function genericLoginParser(line: string): LoginEvent[] {
  const events: LoginEvent[] = [];
  const url = line.match(RE_URL);
  if (url?.[1]) events.push({ type: 'auth-url', url: url[1] });
  const code = line.match(RE_DEVICE_CODE);
  if (code?.[1]) events.push({ type: 'auth-code', code: code[1] });
  if (RE_SUCCESS.test(line)) events.push({ type: 'logged-in' });
  return events;
}

// ---- helpers de step ----
const npmGlobal = (pkg: string, label = 'Instalar via npm'): InstallStep => ({
  label,
  manager: 'npm',
  command: 'npm',
  args: ['install', '-g', pkg],
});

const brewInstall = (formula: string, cask = false): InstallStep => ({
  label: 'Instalar via Homebrew',
  manager: 'brew',
  command: 'brew',
  args: cask ? ['install', '--cask', formula] : ['install', formula],
});

/**
 * Step de instalação via SCRIPT remoto (curl|bash / irm|iex). Marcado `viaScript`
 * — o installer roda com a invocação de shell segura por SO (ver installer.ts).
 * O comando/args descrevem o download + execução; sem interpolar input do usuário.
 */
const curlBash = (url: string, label = 'Instalar via script oficial'): InstallStep => ({
  label,
  manager: 'curl',
  command: 'bash',
  args: ['-c', `curl -fsSL ${url} | bash`],
  viaScript: true,
});

const pwshScript = (url: string, label = 'Instalar via script (PowerShell)'): InstallStep => ({
  label,
  manager: 'powershell',
  command: 'powershell',
  args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${url} | iex`],
  viaScript: true,
});

// =====================================================================
// RECIPES
// =====================================================================

const claude: SetupRecipe = {
  kind: 'claude',
  install: {
    byOs: {
      mac: [
        curlBash('https://claude.ai/install.sh', 'Instalar (instalador nativo)'),
        brewInstall('claude-code', true),
        npmGlobal('@anthropic-ai/claude-code'),
      ],
      linux: [
        curlBash('https://claude.ai/install.sh', 'Instalar (instalador nativo)'),
        npmGlobal('@anthropic-ai/claude-code'),
      ],
      windows: [
        pwshScript('https://claude.ai/install.ps1', 'Instalar (instalador nativo)'),
        npmGlobal('@anthropic-ai/claude-code'),
      ],
    },
    note: 'Instalador nativo auto-atualiza. Requer plano Pro/Max/Team/Enterprise. NUNCA usar sudo.',
  },
  login: {
    method: 'oauth-browser',
    // Claude não tem `claude login`: loga rodando o próprio binário (abre browser).
    command: 'claude',
    args: [],
    parseLine: genericLoginParser,
    // Credencial real do Claude (NÃO .claude.json, que é config e existe sem login).
    successFiles: ['.claude/.credentials.json'],
    successPattern: /login successful/i,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    hint: 'Vamos abrir o navegador para você entrar na sua conta. Se aparecer um link e um código aqui, abra o link e cole o código.',
  },
};

const codex: SetupRecipe = {
  kind: 'codex',
  install: {
    byOs: {
      mac: [
        npmGlobal('@openai/codex'),
        curlBash('https://chatgpt.com/codex/install.sh', 'Instalar via script'),
        brewInstall('codex', true),
      ],
      linux: [npmGlobal('@openai/codex'), curlBash('https://chatgpt.com/codex/install.sh', 'Instalar via script')],
      windows: [npmGlobal('@openai/codex'), pwshScript('https://chatgpt.com/codex/install.ps1', 'Instalar via script')],
    },
  },
  login: {
    method: 'oauth-browser',
    // Codex TEM subcomando dedicado. Callback local em localhost:1455.
    command: 'codex',
    args: ['login'],
    parseLine: genericLoginParser,
    successFiles: ['.codex/auth.json'],
    statusCheck: { command: 'codex', args: ['login', 'status'], okPattern: /logged in/i },
    apiKeyEnv: 'OPENAI_API_KEY',
    hint: 'Vamos abrir o navegador para você entrar com sua conta ChatGPT. Você também pode colar uma chave de API, se preferir.',
  },
};

const gemini: SetupRecipe = {
  kind: 'gemini',
  install: {
    byOs: {
      mac: [npmGlobal('@google/gemini-cli'), brewInstall('gemini-cli')],
      linux: [npmGlobal('@google/gemini-cli'), brewInstall('gemini-cli')],
      windows: [npmGlobal('@google/gemini-cli')],
    },
    note: 'Free-tier individual descontinuado (migrar para Antigravity). Use API key ou conta paga.',
  },
  login: {
    method: 'run-interactive',
    // Gemini não tem `gemini login`: loga rodando `gemini` (menu Sign in with Google).
    command: 'gemini',
    args: [],
    parseLine: genericLoginParser,
    successFiles: ['.gemini/oauth_creds.json'],
    successPattern: /loaded cached credentials/i,
    apiKeyEnv: 'GEMINI_API_KEY',
    hint: 'Vamos abrir o Gemini para você entrar com sua conta Google. Você também pode colar uma chave de API.',
  },
};

const cursor: SetupRecipe = {
  kind: 'cursor',
  install: {
    byOs: {
      mac: [curlBash('https://cursor.com/install', 'Instalar (script oficial)')],
      linux: [curlBash('https://cursor.com/install', 'Instalar (script oficial)')],
      windows: [pwshScript('https://cursor.com/install?win32=true', 'Instalar (script oficial)')],
    },
    note: 'Instala em ~/.local/bin (precisa estar no PATH). Binário: agent (ou cursor-agent).',
  },
  login: {
    method: 'oauth-browser',
    command: 'cursor-agent', // resolvido p/ `agent` se for o nome instalado (ver resolveBinary/aliases)
    args: ['login'],
    parseLine: genericLoginParser,
    // Path de credencial NÃO documentado → confiar no status.
    statusCheck: { command: 'cursor-agent', args: ['status'], okPattern: /(logged in|authenticated|signed in)/i },
    successPattern: RE_SUCCESS,
    apiKeyEnv: 'CURSOR_API_KEY',
    hint: 'Vamos abrir o navegador para você entrar na sua conta Cursor. Você também pode colar uma chave de API.',
  },
};

const opencode: SetupRecipe = {
  kind: 'opencode',
  install: {
    byOs: {
      mac: [curlBash('https://opencode.ai/install', 'Instalar (script oficial)'), npmGlobal('opencode-ai'), brewInstall('opencode')],
      linux: [curlBash('https://opencode.ai/install', 'Instalar (script oficial)'), npmGlobal('opencode-ai')],
      windows: [npmGlobal('opencode-ai')],
    },
  },
  login: {
    method: 'paste-token',
    // `opencode auth login` é TUI por-provider. Preferimos confirmar via auth list + arquivo.
    command: 'opencode',
    args: ['auth', 'login'],
    parseLine: genericLoginParser,
    successFiles: ['.local/share/opencode/auth.json'],
    statusCheck: { command: 'opencode', args: ['auth', 'list'], okPattern: /\w/ },
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    hint: 'Escolha o provedor e cole a chave de API dele (ex.: Claude/Anthropic) para conectar o OpenCode.',
  },
};

const antigravity: SetupRecipe = {
  kind: 'antigravity',
  install: {
    byOs: {
      mac: [curlBash('https://antigravity.google/cli/install.sh', 'Instalar (script oficial)')],
      linux: [curlBash('https://antigravity.google/cli/install.sh', 'Instalar (script oficial)')],
      windows: [
        {
          label: 'Instalar (script oficial)',
          manager: 'powershell',
          command: 'powershell',
          args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://antigravity.google/cli/install.ps1 | iex'],
          viaScript: true,
        },
      ],
    },
    note: 'Binário: agy (instala em ~/.local/bin). Google migrando o Gemini CLI para cá.',
  },
  login: {
    method: 'oauth-browser',
    // Antigravity NÃO tem comando de login — autentica ao rodar `agy` (keyring→browser; SSH: URL+código).
    command: 'agy',
    args: [],
    parseLine: genericLoginParser,
    // Credencial fica no keyring do SO (não em arquivo) → sem successFiles; confiar em URL/sucesso do stdout.
    successPattern: RE_SUCCESS,
    // Sem API key headless documentada.
    hint: 'Vamos abrir o navegador para você entrar com sua conta Google. Se aparecer um link e um código aqui, abra o link e cole o código.',
  },
};

// ---------------- 2º lote: outras CLIs do mercado ----------------
// Fontes: AI/NOTES/17_07_2026-receitas_outras_clis_mercado.md

const pipInstall = (pkg: string, label = 'Instalar via pip'): InstallStep => ({
  label,
  manager: 'pip',
  command: 'pip',
  args: ['install', '-U', pkg],
});

const copilot: SetupRecipe = {
  kind: 'copilot',
  install: {
    byOs: {
      mac: [npmGlobal('@github/copilot'), brewInstall('copilot-cli', true)],
      linux: [npmGlobal('@github/copilot')],
      windows: [npmGlobal('@github/copilot')],
    },
    note: 'Requer Node 22+ e assinatura Copilot ativa.',
  },
  login: {
    method: 'run-interactive',
    // Login é o slash /login dentro do TUI; rodar `copilot` inicia. Preferir PAT via env.
    command: 'copilot',
    args: [],
    parseLine: genericLoginParser,
    apiKeyEnv: 'COPILOT_GITHUB_TOKEN',
    hint: 'Vamos abrir o Copilot para você entrar com sua conta GitHub. Você também pode colar um token de acesso do GitHub.',
  },
};

const aider: SetupRecipe = {
  kind: 'aider',
  install: {
    byOs: {
      mac: [pipInstall('aider-chat'), brewInstall('aider')],
      linux: [pipInstall('aider-chat')],
      windows: [pipInstall('aider-chat')],
    },
    note: 'Aider autentica só por API key/env do provedor — não tem login OAuth.',
  },
  login: {
    method: 'api-key-env',
    // Sem comando de login: só env var por provedor.
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    hint: 'Esta ferramenta funciona colando uma chave de API (do Claude ou do OpenAI). Não há login por navegador.',
  },
};

const qwen: SetupRecipe = {
  kind: 'qwen',
  install: {
    byOs: {
      mac: [npmGlobal('@qwen-code/qwen-code@latest')],
      linux: [npmGlobal('@qwen-code/qwen-code@latest')],
      windows: [npmGlobal('@qwen-code/qwen-code@latest')],
    },
    note: 'OAuth grátis descontinuado (15/04/2026) — use API key (ModelStudio/DeepSeek/OpenRouter).',
  },
  login: {
    method: 'paste-token',
    // Login é /auth dentro do TUI; preferir env var.
    command: 'qwen',
    args: [],
    parseLine: genericLoginParser,
    apiKeyEnv: 'OPENAI_API_KEY',
    hint: 'Cole a chave de API do provedor (ex.: OpenAI ou DashScope) para conectar o Qwen.',
  },
};

const amp: SetupRecipe = {
  kind: 'amp',
  install: {
    byOs: {
      mac: [npmGlobal('@sourcegraph/amp'), curlBash('https://ampcode.com/install.sh', 'Instalar via script')],
      linux: [npmGlobal('@sourcegraph/amp'), curlBash('https://ampcode.com/install.sh', 'Instalar via script')],
      windows: [npmGlobal('@sourcegraph/amp')],
    },
  },
  login: {
    method: 'oauth-browser',
    command: 'amp',
    args: ['login'],
    parseLine: genericLoginParser,
    // ~/.amp/oauth é um DIRETÓRIO (pode existir vazio) → não usar como prova de login.
    apiKeyEnv: 'AMP_API_KEY',
    hint: 'Vamos abrir o navegador para você entrar na sua conta Amp. Você também pode colar uma chave de API.',
  },
};

const goose: SetupRecipe = {
  kind: 'goose',
  install: {
    byOs: {
      mac: [brewInstall('block-goose-cli')],
      linux: [
        brewInstall('block-goose-cli'),
        curlBash(
          'https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh',
          'Instalar via script',
        ),
      ],
      windows: [
        {
          label: 'Instalar (script oficial)',
          manager: 'powershell',
          command: 'powershell',
          args: [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'irm https://github.com/aaif-goose/goose/releases/download/stable/download_cli.ps1 | iex',
          ],
          viaScript: true,
        },
      ],
    },
  },
  login: {
    method: 'paste-token',
    // `goose configure`: menu p/ escolher provider + colar key. Preferir env var.
    command: 'goose',
    args: ['configure'],
    parseLine: genericLoginParser,
    // ~/.config/goose/config.yaml é CONFIG (existe sem login) → não prova autenticação.
    apiKeyEnv: 'OPENAI_API_KEY',
    hint: 'Vamos abrir a configuração do Goose para você escolher o provedor e colar a chave de API.',
  },
};

const grok: SetupRecipe = {
  kind: 'grok',
  install: {
    byOs: {
      mac: [curlBash('https://x.ai/cli/install.sh', 'Instalar (script oficial xAI)')],
      linux: [curlBash('https://x.ai/cli/install.sh', 'Instalar (script oficial xAI)')],
      windows: [],
    },
    note: 'Instalador oficial xAI (não é npm). Requer assinatura SuperGrok.',
  },
  login: {
    method: 'oauth-browser',
    // Sem comando de login dedicado: roda `grok` (abre browser). Ou env var.
    command: 'grok',
    args: [],
    parseLine: genericLoginParser,
    apiKeyEnv: 'GROK_CODE_XAI_API_KEY',
    hint: 'Vamos abrir o navegador para você entrar na sua conta xAI. Você também pode colar uma chave de API (começa com xai-).',
  },
};

const continueCli: SetupRecipe = {
  kind: 'continue',
  install: {
    byOs: {
      mac: [npmGlobal('@continuedev/cli')],
      linux: [npmGlobal('@continuedev/cli')],
      windows: [npmGlobal('@continuedev/cli')],
    },
    note: 'Requer Node 20+.',
  },
  login: {
    method: 'oauth-browser',
    command: 'cn',
    args: ['login'],
    parseLine: genericLoginParser,
    // ~/.continue é o DIRETÓRIO de config (existe sem login) → não prova autenticação.
    apiKeyEnv: 'CONTINUE_API_KEY',
    hint: 'Vamos abrir o navegador para você entrar na sua conta Continue. Você também pode colar uma chave de API.',
  },
};

export const SETUP_RECIPES: Record<CliKind, SetupRecipe> = {
  claude,
  codex,
  gemini,
  cursor,
  opencode,
  antigravity,
  copilot,
  aider,
  qwen,
  amp,
  goose,
  grok,
  continue: continueCli,
};

export function getSetupRecipe(kind: CliKind): SetupRecipe {
  return SETUP_RECIPES[kind];
}

/** Allowlist de gerenciadores permitidos para instalação (hardening). */
export const ALLOWED_MANAGERS = new Set(['npm', 'pnpm', 'brew', 'pip', 'pipx', 'curl', 'powershell', 'bash']);

import type { DetectedCli } from '@llm-proxy/shared-types';

/** Mensagem amigável (leigo) a partir de uma resposta de erro. */
async function friendlyError(res: Response): Promise<string> {
  // tenta extrair {error} do corpo JSON
  let detail = '';
  try {
    const data = (await res.clone().json()) as { error?: string };
    if (data?.error) detail = data.error;
  } catch {
    /* corpo não-JSON */
  }
  if (detail) return detail;
  switch (res.status) {
    case 401:
      return 'Sua sessão expirou. Faça login novamente.';
    case 403:
      return 'Você não tem permissão para esta ação.';
    case 404:
      return 'Item não encontrado.';
    case 429:
      return 'Muitas tentativas. Aguarde um instante e tente de novo.';
    default:
      return res.status >= 500
        ? 'Algo deu errado no servidor. Tente novamente em instantes.'
        : 'Não foi possível concluir a ação.';
  }
}

/** Cliente HTTP fino para a API interna. */
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new Error(await friendlyError(res));
  }
  return (await res.json()) as T;
}

export interface ProxyKeyView {
  id: string;
  name: string;
  cliKind: string;
  defaultModel: string | null;
  allowedModels: string[];
  rateLimitPerMin: number;
  dailyTokenQuota: number | null;
  enabled: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  usedTokensToday: number;
  tokenSaver: boolean;
  terseness: string;
  secondsUntilDailyReset: number;
}

export interface CreateKeyResult {
  key: ProxyKeyView;
  rawKey: string;
  preview: { openaiBaseUrl: string; anthropicBaseUrl: string; curlExample: string };
}

export interface ChatSessionView {
  id: string;
  cliKind: string;
  model: string | null;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
}

export interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  attachments?: { kind: string; name: string; mime: string; url?: string }[] | null;
  createdAt: string;
}

export interface CliConfigView {
  id: string;
  kind: string;
  enabled: boolean;
  defaultModel: string | null;
  allowedModels: string[];
  thinkingDefault: boolean;
  timeoutMs: number;
}

export interface UserView {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'viewer';
  disabled: boolean;
  createdAt: string;
  keysCount: number;
  sessionsCount: number;
}

export interface SessionView {
  id: string;
  current: boolean;
  userEmail: string;
  userName: string | null;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
}

// ── Capability Router / Combos ──────────────────────────────────────────────
export interface FunctionMeta {
  slug: string;
  label: string;
  group: 'gerar' | 'analisar' | 'especial';
  icon: string;
  inputModality?: string;
  hint: string;
}
export interface CapabilityMatrix {
  functions: FunctionMeta[];
  byCli: Record<string, string[]>;
}
export interface ComboItemView {
  id: string;
  order: number;
  source: 'cli' | 'http';
  cliKind: string | null;
  provider: string | null;
  model: string | null;
}
export interface ComboView {
  id: string;
  slug: string;
  name: string;
  strategy: string;
  enabled: boolean;
  items: ComboItemView[];
}
export interface RouterRuleView {
  id: string;
  capability: string;
  source: 'cli' | 'http' | null;
  cliKind: string | null;
  provider: string | null;
  model: string | null;
  comboId: string | null;
}
export interface RouterView {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  rules: RouterRuleView[];
}
export interface HttpProviderView {
  provider: string;
  enabled: boolean;
  baseUrl: string | null;
  keySet: boolean;
  keyMasked: string;
  updatedAt: string;
}

export const api = {
  // auth
  authStatus: () => req<{ needsSetup: boolean }>('/api/auth/status'),
  setupAdmin: (data: { email: string; name?: string; password: string }) =>
    req<{ ok: boolean }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  me: () =>
    req<{ user: { id: string; email: string; name: string | null; role: string } }>('/api/auth/me'),
  login: (email: string, password: string) =>
    req<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  detect: () => req<{ detected: DetectedCli[] }>('/api/detect', { method: 'POST' }),
  detectCached: () => req<{ detected: DetectedCli[] }>('/api/detect'),
  proxyInfo: () =>
    req<{
      openaiBaseUrl: string;
      anthropicBaseUrl: string;
      openaiEndpoint: string;
      anthropicEndpoint: string;
    }>('/api/proxy-info'),
  usage: () =>
    req<{
      totalRequests: number;
      totalTokens: number;
      errors: number;
      avgLatencyMs: number;
      byModel: Record<string, { requests: number; tokens: number }>;
      byDay: { day: string; requests: number; tokens: number }[];
      recent: {
        ts: string;
        model: string;
        keyName: string;
        cliKind: string;
        tokens: number;
        estimated: boolean;
        latencyMs: number;
        status: number;
      }[];
    }>('/api/usage'),
  listKeys: () => req<{ keys: ProxyKeyView[] }>('/api/keys'),
  createKey: (data: Record<string, unknown>) =>
    req<CreateKeyResult>('/api/keys', { method: 'POST', body: JSON.stringify(data) }),
  updateKey: (id: string, data: Record<string, unknown>) =>
    req<{ key: ProxyKeyView }>(`/api/keys/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rotateKey: (id: string) =>
    req<{ key: ProxyKeyView; rawKey: string }>(`/api/keys/${id}/rotate`, { method: 'POST' }),
  revokeKey: (id: string) => req<{ ok: boolean }>(`/api/keys/${id}/revoke`, { method: 'POST' }),
  deleteKey: (id: string) => req<{ ok: boolean }>(`/api/keys/${id}`, { method: 'DELETE' }),

  // chat
  listSessions: () => req<{ sessions: ChatSessionView[] }>('/api/chat/sessions'),
  createSession: (data: { cliKind: string; model?: string; title?: string }) =>
    req<{ session: ChatSessionView }>('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sessionMessages: (id: string) =>
    req<{ messages: ChatMessageView[] }>(`/api/chat/sessions/${id}/messages`),
  deleteSession: (id: string) =>
    req<{ ok: boolean }>(`/api/chat/sessions/${id}`, { method: 'DELETE' }),

  // config
  listConfig: () => req<{ configs: CliConfigView[] }>('/api/config'),
  upsertConfig: (data: Record<string, unknown>) =>
    req<{ config: CliConfigView }>('/api/config', { method: 'PUT', body: JSON.stringify(data) }),

  // usuários (admin)
  listUsers: () => req<{ users: UserView[] }>('/api/users'),
  createUser: (data: { email: string; name?: string; password: string; role: 'admin' | 'viewer' }) =>
    req<{ user: UserView }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Record<string, unknown>) =>
    req<{ user: UserView }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => req<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),

  // sessões de login
  listSessionsAll: (all?: boolean) =>
    req<{ sessions: SessionView[] }>(`/api/sessions${all ? '?all=1' : ''}`),
  revokeSession: (id: string) => req<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () =>
    req<{ ok: boolean; revoked: number }>('/api/sessions/revoke-others', { method: 'POST' }),

  // setup wizard (instalação + login)
  setupPlan: (kind: string) => req<{ plan: SetupPlanView }>(`/api/setup/plan/${kind}`),
  loginStatus: () => req<{ status: Record<string, boolean> }>('/api/setup/login-status'),
  submitLoginInput: (loginId: string, value: string) =>
    req<{ ok: boolean }>('/api/setup/login/input', {
      method: 'POST',
      body: JSON.stringify({ loginId, value }),
    }),
  cancelLogin: (loginId: string) =>
    req<{ ok: boolean }>('/api/setup/login/cancel', {
      method: 'POST',
      body: JSON.stringify({ loginId }),
    }),

  // capabilities (matriz p/ a tela inteligente)
  capabilities: (all?: boolean) =>
    req<{ matrix: CapabilityMatrix; available: string[] }>(`/api/capabilities${all ? '?all=1' : ''}`),

  // combos
  listCombos: () => req<{ combos: ComboView[] }>('/api/combos'),
  createCombo: (data: Record<string, unknown>) =>
    req<{ combo: ComboView }>('/api/combos', { method: 'POST', body: JSON.stringify(data) }),
  updateCombo: (id: string, data: Record<string, unknown>) =>
    req<{ combo: ComboView }>(`/api/combos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCombo: (id: string) => req<{ ok: boolean }>(`/api/combos/${id}`, { method: 'DELETE' }),

  // routers (workflow)
  listRouters: () => req<{ routers: RouterView[] }>('/api/routers'),
  createRouter: (data: Record<string, unknown>) =>
    req<{ router: RouterView }>('/api/routers', { method: 'POST', body: JSON.stringify(data) }),
  updateRouter: (id: string, data: Record<string, unknown>) =>
    req<{ router: RouterView }>(`/api/routers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRouter: (id: string) => req<{ ok: boolean }>(`/api/routers/${id}`, { method: 'DELETE' }),
  detectCapability: (text: string) =>
    req<{ capability: string | null }>('/api/routers/detect', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // http providers (keys diretas p/ deploy container/VPS/fallback)
  listHttpProviders: () => req<{ providers: HttpProviderView[] }>('/api/http-providers'),
  upsertHttpProvider: (data: { provider: string; apiKey: string; baseUrl?: string | null; enabled?: boolean }) =>
    req<{ ok: boolean }>('/api/http-providers', { method: 'POST', body: JSON.stringify(data) }),
  deleteHttpProvider: (provider: string) =>
    req<{ ok: boolean }>(`/api/http-providers/${provider}`, { method: 'DELETE' }),
};

export interface SetupPlanView {
  kind: string;
  os: string;
  commands: { label: string; command: string; viaScript: boolean }[];
  installable: boolean;
  installNote?: string;
  login: {
    method: 'oauth-browser' | 'device-code' | 'paste-token' | 'api-key-env' | 'run-interactive';
    hint?: string;
    apiKeyEnv?: string;
    supportsApiKey: boolean;
  };
}

/**
 * Envia mensagem no chat e consome o stream SSE.
 * Chama onDelta a cada pedaço e onDone ao final.
 */
export interface ChatAttachment {
  kind: 'image' | 'file' | 'audio';
  name: string;
  mime: string;
  dataBase64?: string;
}

/**
 * Consome um endpoint SSE (event/data) via fetch POST, chamando `onEvent`
 * para cada evento com o nome e o payload parseado. Base de streamChat e
 * streamInstall/streamLogin.
 */
export async function streamSse(
  path: string,
  body: Record<string, unknown>,
  onEvent: (event: string, data: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (!res.body) throw new Error('Sem corpo de resposta');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data) as Record<string, unknown>);
      } catch {
        /* linha malformada — ignora */
      }
    }
  }
}

export async function streamChat(
  sessionId: string,
  body: {
    content: string;
    thinking?: boolean;
    model?: string;
    attachments?: ChatAttachment[];
    imageMode?: boolean;
  },
  handlers: {
    onDelta: (text: string) => void;
    onThinking?: (text: string) => void;
    onImage?: (url: string) => void;
    onError?: (message: string) => void;
    onDone?: (data: unknown) => void;
  },
): Promise<void> {
  await streamSse(`/api/chat/sessions/${sessionId}/send`, body, (event, parsed) => {
    if (event === 'delta') handlers.onDelta(String(parsed.text ?? ''));
    else if (event === 'thinking') handlers.onThinking?.(String(parsed.text ?? ''));
    else if (event === 'image') handlers.onImage?.(String(parsed.url ?? ''));
    else if (event === 'error') handlers.onError?.(String(parsed.message ?? 'erro'));
    else if (event === 'done') handlers.onDone?.(parsed);
  });
}

/** Instala uma CLI, emitindo progresso ao vivo. */
export function streamInstall(
  kind: string,
  handlers: {
    onProgress: (line: string) => void;
    onDone: (installed: boolean, version?: string) => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  return streamSse(
    '/api/setup/install',
    { kind },
    (event, data) => {
      if (event === 'progress') handlers.onProgress(String(data.line ?? ''));
      else if (event === 'done') handlers.onDone(Boolean(data.installed), data.version as string | undefined);
      else if (event === 'error') handlers.onError(String(data.message ?? 'erro'));
    },
    signal,
  );
}

/** Conduz o login de uma CLI, emitindo eventos (url/código/aguardando/logado). */
export function streamLogin(
  body: { kind: string; apiKey?: string; headless?: boolean },
  handlers: {
    onSession: (loginId: string) => void;
    onProgress: (line: string) => void;
    onAuthUrl: (url: string) => void;
    onAuthCode: (code: string) => void;
    onAwaitingInput: (prompt: string, secret: boolean) => void;
    onLoggedIn: () => void;
    onError: (message: string) => void;
    onDone: () => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  return streamSse(
    '/api/setup/login',
    body,
    (event, data) => {
      switch (event) {
        case 'session':
          handlers.onSession(String(data.loginId ?? ''));
          break;
        case 'progress':
          handlers.onProgress(String(data.line ?? ''));
          break;
        case 'auth-url':
          handlers.onAuthUrl(String(data.url ?? ''));
          break;
        case 'auth-code':
          handlers.onAuthCode(String(data.code ?? ''));
          break;
        case 'awaiting-input':
          handlers.onAwaitingInput(String(data.prompt ?? ''), Boolean(data.secret));
          break;
        case 'logged-in':
          handlers.onLoggedIn();
          break;
        case 'error':
          handlers.onError(String(data.message ?? 'erro'));
          break;
        case 'done':
          handlers.onDone();
          break;
      }
    },
    signal,
  );
}

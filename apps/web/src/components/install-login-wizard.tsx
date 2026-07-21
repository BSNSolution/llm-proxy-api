import { useEffect, useRef, useState } from 'react';
import { Check, Download, ExternalLink, KeyRound, Loader2, Terminal } from 'lucide-react';
import {
  api,
  streamInstall,
  streamLogin,
  type SetupPlanView,
} from '../lib/api.js';
import { Modal } from './ui/modal.js';
import { Button } from './ui/button.js';
import { Field, Input } from './ui/input.js';
import { HintTip } from './ui/tooltip.js';
import { CliIcon, CLI_LABELS } from './cli-card.js';
import { cn } from '../lib/cn.js';

type Stage = 'plan' | 'installing' | 'installed' | 'login' | 'done';

/**
 * Wizard de instalação + login de uma CLI. Fluxo:
 * plan (mostra comando + confirma) → installing (stream) → installed →
 * login (URL clicável / campo de código-token / aguardando) → done.
 */
export function InstallLoginWizard({
  kind,
  alreadyInstalled = false,
  onClose,
  onFinished,
}: {
  kind: string;
  /** se a CLI já está instalada, pula direto para o login */
  alreadyInstalled?: boolean;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [plan, setPlan] = useState<SetupPlanView | null>(null);
  const [stage, setStage] = useState<Stage>(alreadyInstalled ? 'installed' : 'plan');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // login state
  const [loginId, setLoginId] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.setupPlan(kind).then(({ plan }) => setPlan(plan)).catch((e) => setError(String(e)));
    return () => abortRef.current?.abort();
  }, [kind]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [log]);

  function pushLog(line: string) {
    setLog((l) => [...l.slice(-400), line]);
  }

  async function runInstall() {
    setError(null);
    setStage('installing');
    setLog([]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamInstall(
        kind,
        {
          onProgress: pushLog,
          // em erro: volta ao plano (mostra o comando + botões Cancelar/Instalar de novo)
          onError: (m) => {
            setError(m);
            setStage('plan');
          },
          onDone: (installed) => {
            if (installed) setStage('installed');
            else {
              setError('Instalação não concluída. Veja o log.');
              setStage('plan');
            }
          },
        },
        ac.signal,
      );
      // se o stream fechou sem 'done' nem 'error' (ex.: processo encerrou), não deixa preso
      setStage((s) => (s === 'installing' ? 'plan' : s));
    } catch (e) {
      if (!ac.signal.aborted) {
        setError(String(e));
        setStage('plan');
      }
    }
  }

  async function runLogin(useApiKey: boolean) {
    setError(null);
    setStage('login');
    setLog([]);
    setAuthUrl(null);
    setAuthCode(null);
    setLoggedIn(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamLogin(
        {
          kind,
          apiKey: useApiKey ? apiKey.trim() : undefined,
          // headless=false: máquina local (browser abre). Backend só usa quando aplicável.
          headless: false,
        },
        {
          onSession: setLoginId,
          onProgress: pushLog,
          onAuthUrl: setAuthUrl,
          onAuthCode: setAuthCode,
          onAwaitingInput: (prompt) => pushLog(`» ${prompt}`),
          onLoggedIn: () => setLoggedIn(true),
          onError: (m) => setError(m),
          onDone: () => {
            // o loggedIn é setado no evento; damos um tick pro estado assentar
            setStage((s) => (s === 'login' ? 'done' : s));
          },
        },
        ac.signal,
      );
      setStage('done');
    } catch (e) {
      if (!ac.signal.aborted) setError(String(e));
    }
  }

  async function submitCode() {
    if (!loginId || !inputValue.trim()) return;
    setBusy(true);
    try {
      await api.submitLoginInput(loginId, inputValue.trim());
      pushLog(`» código enviado`);
      setInputValue('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const label = CLI_LABELS[kind] ?? kind;

  return (
    <Modal title={`Instalar & logar — ${label}`} onClose={onClose} size="lg">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-surface-3">
          <CliIcon kind={kind} size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          <p className="text-xs text-fg-subtle">
            {stage === 'plan' && 'Revise o comando de instalação e confirme.'}
            {stage === 'installing' && 'Instalando...'}
            {stage === 'installed' && 'Instalado. Agora faça o login.'}
            {stage === 'login' && 'Aguardando login...'}
            {stage === 'done' && (loggedIn ? 'Pronto!' : 'Concluído.')}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">
          {error}
        </div>
      )}

      {/* PLAN */}
      {stage === 'plan' && (
        <div className="mt-4 flex flex-col gap-3">
          {!plan ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 size={15} className="animate-spin" /> carregando plano...
            </div>
          ) : !plan.installable ? (
            <>
              <div className="rounded-md border border-warn/25 bg-warn/10 px-3 py-3 text-sm text-warn">
                Não há instalação automática desta CLI para o seu sistema operacional.
                {plan.installNote ? ` ${plan.installNote}` : ''} Instale manualmente e clique em Detectar.
              </div>
              <div className="mt-1 flex justify-end">
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-fg-muted">
                Vamos rodar o comando abaixo na sua máquina (o primeiro que funcionar):
              </p>
              <div className="flex flex-col gap-2">
                {plan.commands.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2.5"
                  >
                    <Terminal size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
                    <div className="min-w-0">
                      <code className="block break-all font-mono text-[13px] text-fg">{c.command}</code>
                      <span className="text-2xs text-fg-subtle">{c.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              {plan.installNote && (
                <p className="text-xs text-warn">{plan.installNote}</p>
              )}
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={runInstall}>
                  <Download size={15} /> Instalar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* INSTALLING */}
      {stage === 'installing' && <LogView log={log} endRef={logEndRef} />}

      {/* INSTALLED → escolha do login */}
      {stage === 'installed' && plan && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-fg-muted">{plan.login.hint}</p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => runLogin(false)}>
              <KeyRound size={15} /> Fazer login
              {plan.login.method === 'oauth-browser' ? ' (abre o navegador)' : ''}
            </Button>

            {plan.login.supportsApiKey && (
              <div className="rounded-lg border border-border bg-surface-3/40 p-3">
                <Field
                  label={
                    <span className="inline-flex items-center gap-1">
                      Ou cole uma chave de API
                      <HintTip content="Uma chave de API é um código secreto que a ferramenta gera na conta do provedor (ex.: no site do OpenAI, Anthropic ou GitHub). Cole aqui como alternativa ao login por navegador." />
                    </span>
                  }
                  hint="Alternativa ao login pelo navegador."
                >
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="ex.: sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => runLogin(true)}
                      disabled={!apiKey.trim()}
                    >
                      Usar
                    </Button>
                  </div>
                </Field>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOGIN em andamento */}
      {stage === 'login' && (
        <div className="mt-4 flex flex-col gap-3">
          {authUrl && (
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-fg transition-colors hover:bg-primary/15"
            >
              <span className="truncate font-mono text-[13px]">{authUrl}</span>
              <ExternalLink size={15} className="shrink-0 text-primary" />
            </a>
          )}
          {authCode && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5 text-center">
              <p className="text-2xs uppercase tracking-wider text-fg-subtle">Código</p>
              <p className="font-mono text-lg font-semibold tracking-widest text-fg">{authCode}</p>
            </div>
          )}
          <Field
            label="Se aparecer um código na tela de login, cole aqui"
            hint="Só é preciso quando o login pede um código para confirmar."
          >
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="cole o código aqui"
                onKeyDown={(e) => e.key === 'Enter' && void submitCode()}
              />
              <Button variant="secondary" onClick={submitCode} loading={busy} disabled={!inputValue.trim()}>
                Enviar
              </Button>
            </div>
          </Field>
          <LogView log={log} endRef={logEndRef} />
        </div>
      )}

      {/* DONE */}
      {stage === 'done' && (
        <div className="mt-4 flex flex-col items-center gap-4 py-4">
          <span
            className={cn(
              'grid h-14 w-14 place-items-center rounded-full',
              loggedIn ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-fg-muted',
            )}
          >
            {loggedIn ? <Check size={28} /> : <KeyRound size={26} />}
          </span>
          <p className="text-center text-sm text-fg-muted">
            {loggedIn
              ? `${label} está instalada e logada. Já pode usar no proxy e no chat.`
              : `${label} instalada. Se o login não confirmou, tente novamente ou use a API key.`}
          </p>
          <div className="flex gap-2">
            {!loggedIn && (
              <Button variant="outline" onClick={() => setStage('installed')}>
                Tentar login de novo
              </Button>
            )}
            <Button
              onClick={() => {
                onFinished();
                onClose();
              }}
            >
              Concluir
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function LogView({
  log,
  endRef,
}: {
  log: string[];
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="mt-4 h-56 overflow-y-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs text-fg-muted">
      {log.length === 0 ? (
        <span className="flex items-center gap-2 text-fg-subtle">
          <Loader2 size={13} className="animate-spin" /> aguardando saída...
        </span>
      ) : (
        log.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
            {line}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}

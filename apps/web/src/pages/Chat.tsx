import { useEffect, useRef, useState } from 'react';
import { Brain, ImageIcon, MessagesSquare, Paperclip, Plus, Send, Sparkles, X } from 'lucide-react';
import type { DetectedCli } from '@llm-proxy/shared-types';
import {
  api,
  streamChat,
  type ChatAttachment,
  type ChatMessageView,
  type ChatSessionView,
} from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Select } from '../components/ui/select.js';
import { Tooltip } from '../components/ui/tooltip.js';
import { PageHeader, EmptyState } from '../components/ui/page-header.js';
import { Pagination, usePagination } from '../components/ui/pagination.js';
import { CliIcon, CLI_LABELS } from '../components/cli-card.js';
import { cn } from '../lib/cn.js';

type Msg = { role: string; content: string; thinking?: string; imageUrl?: string };

export function ChatPage() {
  const [sessions, setSessions] = useState<ChatSessionView[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [clis, setClis] = useState<DetectedCli[]>([]);
  const [newKind, setNewKind] = useState('claude');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionsPg = usePagination(sessions, 15);

  const activeSession = sessions.find((s) => s.id === active);
  const activeCli = clis.find((c) => c.kind === activeSession?.cliKind);
  const canAttach = activeCli?.capabilities.images || activeCli?.capabilities.files;
  const canGenImage = activeCli?.capabilities.imagesOut ?? false;

  async function reloadSessions() {
    const { sessions } = await api.listSessions();
    setSessions(sessions);
  }
  useEffect(() => {
    void reloadSessions();
    api.detectCached().then(({ detected }) => setClis(detected.filter((c) => c.present)));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function openSession(id: string) {
    setActive(id);
    setImageMode(false);
    const { messages } = await api.sessionMessages(id);
    setMessages(
      messages.map((m: ChatMessageView) => {
        const img = m.attachments?.find((a) => a.kind === 'image' && a.url);
        return { role: m.role, content: m.content, ...(img?.url ? { imageUrl: img.url } : {}) };
      }),
    );
  }

  async function newSession() {
    const { session } = await api.createSession({ cliKind: newKind });
    await reloadSessions();
    await openSession(session.id);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    const next: ChatAttachment[] = [];
    for (const f of Array.from(files)) {
      const dataBase64 = await fileToBase64(f);
      const kind: ChatAttachment['kind'] = f.type.startsWith('image/')
        ? 'image'
        : f.type.startsWith('audio/')
          ? 'audio'
          : 'file';
      next.push({ kind, name: f.name, mime: f.type || 'application/octet-stream', dataBase64 });
    }
    setAttachments((a) => [...a, ...next]);
  }

  async function send() {
    if (!active || (!input.trim() && attachments.length === 0) || streaming) return;
    const content = input.trim() || '(anexo)';
    const atts = attachments;
    setInput('');
    setAttachments([]);
    const label = atts.length ? `${content}  (${atts.length} anexo${atts.length > 1 ? 's' : ''})` : content;
    setMessages((m) => [...m, { role: 'user', content: label }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    try {
      await streamChat(
        active,
        { content, thinking, imageMode, attachments: atts.length ? atts : undefined },
        {
          onDelta: (text) =>
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1]!;
              copy[copy.length - 1] = { ...last, role: 'assistant', content: last.content + text };
              return copy;
            }),
          onThinking: (text) =>
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1]!;
              copy[copy.length - 1] = { ...last, thinking: (last.thinking ?? '') + text };
              return copy;
            }),
          onImage: (url) =>
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: 'assistant', content: '', imageUrl: url };
              return copy;
            }),
          onError: (message) =>
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: 'assistant', content: `[erro] ${message}` };
              return copy;
            }),
        },
      );
    } finally {
      setStreaming(false);
      void reloadSessions();
    }
  }

  return (
    <main className="flex h-[calc(100dvh-8rem)] flex-col gap-5 lg:h-[calc(100dvh-4rem)]">
      <PageHeader eyebrow="Interativo" title="Chat" />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Lista de sessões — some no mobile quando há conversa aberta */}
        <div
          className={cn(
            'flex min-h-0 flex-col rounded-lg border border-border bg-surface-2/60 p-3',
            active && 'hidden lg:flex',
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <Select
              size="sm"
              value={newKind}
              onChange={setNewKind}
              className="flex-1"
              options={(clis.length ? clis.map((c) => c.kind) : ['claude']).map((k) => ({
                value: k,
                label: CLI_LABELS[k] ?? k,
                icon: <CliIcon kind={k} size={14} />,
              }))}
            />
            <Button size="icon-sm" onClick={newSession} aria-label="Nova conversa">
              <Plus size={16} />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {sessionsPg.pageItems.map((s) => (
              <button
                key={s.id}
                onClick={() => openSession(s.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  s.id === active ? 'bg-surface-3' : 'hover:bg-surface-2',
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-3 text-fg-muted">
                  <CliIcon kind={s.cliKind} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{s.title}</span>
                  <span className="block truncate text-2xs text-fg-subtle">
                    {CLI_LABELS[s.cliKind] ?? s.cliKind} · {s._count?.messages ?? 0} msgs
                  </span>
                </span>
              </button>
            ))}
            {sessions.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-fg-subtle">Crie uma conversa.</p>
            )}
          </div>
          {sessionsPg.totalPages > 1 && (
            <div className="border-t border-border pt-1">
              <Pagination {...sessionsPg} label="conversas" />
            </div>
          )}
        </div>

        {/* Área de conversa */}
        <div
          className={cn(
            'flex min-h-0 flex-col rounded-lg border border-border bg-surface-2/40',
            !active && 'hidden lg:flex',
          )}
        >
          {!active ? (
            <div className="m-auto flex flex-col items-center gap-2 text-fg-subtle">
              <MessagesSquare size={28} />
              <p className="text-sm">Selecione ou crie uma conversa.</p>
            </div>
          ) : (
            <>
              {/* Header da conversa */}
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <button className="text-fg-subtle lg:hidden" onClick={() => setActive(null)}>
                  <X size={18} />
                </button>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-3">
                  <CliIcon kind={activeSession?.cliKind ?? 'claude'} size={14} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{activeSession?.title}</p>
                  <p className="text-2xs text-fg-subtle">
                    {CLI_LABELS[activeSession?.cliKind ?? ''] ?? activeSession?.cliKind}
                    {activeSession?.model ? ` · ${activeSession.model}` : ''}
                  </p>
                </div>
              </div>

              {/* Mensagens */}
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
                {messages.length === 0 && (
                  <div className="mx-auto max-w-sm pt-10">
                    <EmptyState icon={<Sparkles size={26} />} title="Comece a conversa">
                      Envie uma mensagem para {CLI_LABELS[activeSession?.cliKind ?? ''] ?? 'a LLM'}.
                    </EmptyState>
                  </div>
                )}
                {messages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    msg={m}
                    cliKind={activeSession?.cliKind ?? 'claude'}
                    streaming={streaming && i === messages.length - 1}
                    imageMode={imageMode}
                  />
                ))}
                <div ref={endRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-border p-3">
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2.5 py-1 text-xs"
                      >
                        <Paperclip size={12} />
                        <span className="max-w-[140px] truncate">{a.name}</span>
                        <button
                          className="text-fg-subtle hover:text-err"
                          onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-lg border border-border bg-surface-2 p-2 transition-colors focus-within:border-primary/50">
                  <div className="flex items-center gap-1 pl-1">
                    <Tooltip content="Raciocínio estendido (mais lento).">
                      <button
                        onClick={() => setThinking((v) => !v)}
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-md transition-colors',
                          thinking ? 'bg-primary/15 text-primary' : 'text-fg-subtle hover:bg-surface-3',
                        )}
                        aria-label="Thinking"
                      >
                        <Brain size={16} />
                      </button>
                    </Tooltip>
                    {canGenImage && (
                      <Tooltip content="Modo imagem: a próxima mensagem gera uma imagem.">
                        <button
                          onClick={() => setImageMode((v) => !v)}
                          className={cn(
                            'grid h-8 w-8 place-items-center rounded-md transition-colors',
                            imageMode
                              ? 'bg-primary/15 text-primary'
                              : 'text-fg-subtle hover:bg-surface-3',
                          )}
                          aria-label="Modo imagem"
                        >
                          <ImageIcon size={16} />
                        </button>
                      </Tooltip>
                    )}
                    {canAttach && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => onPickFiles(e.target.files)}
                        />
                        <Tooltip content="Anexar imagem, arquivo ou áudio.">
                          <button
                            onClick={() => fileRef.current?.click()}
                            disabled={streaming}
                            className="grid h-8 w-8 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3"
                            aria-label="Anexar"
                          >
                            <Paperclip size={16} />
                          </button>
                        </Tooltip>
                      </>
                    )}
                  </div>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={1}
                    placeholder={
                      imageMode
                        ? 'Descreva a imagem a gerar…'
                        : `Mensagem para ${CLI_LABELS[activeSession?.cliKind ?? ''] ?? 'a LLM'}…`
                    }
                    disabled={streaming}
                    className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-fg outline-none placeholder:text-fg-subtle"
                  />
                  <Button size="icon" onClick={send} loading={streaming} aria-label="Enviar">
                    {!streaming && <Send size={15} />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function MessageBubble({
  msg,
  cliKind,
  streaming,
  imageMode,
}: {
  msg: Msg;
  cliKind: string;
  streaming: boolean;
  imageMode: boolean;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* avatar */}
      <span
        className={cn(
          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold',
          isUser
            ? 'bg-gradient-to-br from-primary to-[rgb(90_50_200)] text-white'
            : 'border border-border bg-surface-3 text-fg-muted',
        )}
      >
        {isUser ? 'V' : <CliIcon kind={cliKind} size={14} />}
      </span>

      <div className={cn('flex min-w-0 max-w-[78%] flex-col gap-1.5', isUser && 'items-end')}>
        {msg.thinking && (
          <details className="w-full rounded-lg border border-border bg-bg/50 px-3 py-2 text-xs text-fg-muted">
            <summary className="flex cursor-pointer select-none items-center gap-1.5">
              <Brain size={13} /> Raciocínio
            </summary>
            <div className="mt-2 whitespace-pre-wrap">{msg.thinking}</div>
          </details>
        )}
        {msg.imageUrl ? (
          <a
            href={msg.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="block max-w-[320px] overflow-hidden rounded-lg border border-border"
          >
            <img src={msg.imageUrl} alt="imagem gerada" className="w-full" />
          </a>
        ) : (
          <div
            className={cn(
              'whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-primary text-primary-fg'
                : 'border border-border bg-surface-3 text-fg',
            )}
          >
            {msg.content || (streaming ? (imageMode ? 'Gerando imagem…' : '…') : '')}
          </div>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

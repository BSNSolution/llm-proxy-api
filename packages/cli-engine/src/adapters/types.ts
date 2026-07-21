import type { CliKind, CliTurn, StreamEvent } from '@llm-proxy/shared-types';

/** O que um adapter de CLI precisa implementar. */
export interface CliAdapter {
  readonly kind: CliKind;

  /**
   * Constrói o comando/args/env para executar um turno em modo one-shot (spawn por request).
   */
  buildArgs(turn: CliTurn): { command: string; args: string[]; env?: Record<string, string> };

  /**
   * Traduz UMA linha bruta do stdout da CLI (NDJSON/SSE/texto) para eventos normalizados.
   * Pode retornar zero, um ou vários eventos por linha.
   */
  parseLine(line: string): StreamEvent[];

  /** Se true, a CLI suporta sessão persistente (processo vivo multi-turno). */
  readonly supportsPersistentSession: boolean;
}

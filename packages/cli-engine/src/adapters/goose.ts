import type { CliTurn, StreamEvent } from '@llm-proxy/shared-types';
import type { CliAdapter } from './types.js';
import { composePrompt } from './shared.js';

/**
 * Adapter do Goose (Block/AAIF, `goose`).
 * Headless: `goose run -t "<prompt>" --no-session --max-turns N` → texto puro.
 * Modelo e auto-aprovação são por ENV (não há --model no run): GOOSE_MODE=auto,
 * e opcionalmente GOOSE_MODEL. Sem tokens reais (estima).
 * Fonte: AI/NOTES/20_07_2026-modo_headless_7_clis_mercado.md
 *
 * ⚠️ Não validado E2E.
 */
export class GooseAdapter implements CliAdapter {
  readonly kind = 'goose' as const;
  readonly supportsPersistentSession = false;

  buildArgs(turn: CliTurn): { command: string; args: string[]; env?: Record<string, string> } {
    const args = ['run', '-t', composePrompt(turn), '--no-session', '--max-turns', '12'];
    // GOOSE_MODE=auto evita travar pedindo aprovação. NÃO setamos GOOSE_MODEL sozinho:
    // ele exige GOOSE_PROVIDER junto (que depende da conta) — deixamos o modelo/provider
    // vir do `goose configure`. Setar só o modelo geraria estado inconsistente.
    return { command: 'goose', args, env: { GOOSE_MODE: 'auto' } };
  }

  parseLine(line: string): StreamEvent[] {
    if (!line) return [];
    return [{ type: 'delta', text: `${line}\n` }];
  }
}

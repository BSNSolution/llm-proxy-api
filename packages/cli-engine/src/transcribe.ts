import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveBinary } from './platform/index.js';

const pExecFile = promisify(execFile);

/**
 * Localiza um modelo ggml do whisper.cpp. Ordem: env WHISPER_MODEL_PATH →
 * locais convencionais. Retorna null se nenhum modelo for encontrado.
 */
function findWhisperModel(): string | null {
  const envPath = process.env.WHISPER_MODEL_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const home = homedir();
  const candidates = [
    join(home, '.claude', 'tools', 'whisper-models', 'ggml-base.bin'),
    join(home, '.cache', 'whisper', 'ggml-base.bin'),
    '/opt/homebrew/share/whisper-cpp/ggml-base.bin',
    '/usr/local/share/whisper-cpp/ggml-base.bin',
    '/usr/share/whisper-cpp/ggml-base.bin',
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Transcreve um arquivo de áudio para texto usando whisper.cpp (`whisper-cli`),
 * se disponível na máquina. Áudio NÃO é primitivo das LLM CLIs de coding, então
 * transcrevemos antes e injetamos o texto no prompt.
 *
 * Retorna null se o whisper não estiver instalado (o chamador então trata o
 * áudio como arquivo comum via @path, ou avisa que não há transcrição).
 */
export async function transcribeAudio(audioPath: string): Promise<string | null> {
  const whisper =
    (await resolveBinary('whisper-cli')) ??
    (await resolveBinary('whisper-cpp')) ??
    (await resolveBinary('whisper'));
  if (!whisper || !existsSync(audioPath)) return null;
  const model = findWhisperModel();
  if (!model) return null;

  try {
    // whisper-cli grava <audio>.txt com --output-txt. -nt evita timestamps.
    const outPrefix = audioPath;
    await pExecFile(
      whisper,
      ['-m', model, '-f', audioPath, '--output-txt', '--output-file', outPrefix, '-nt'],
      { timeout: 120_000 },
    );
    const txtPath = `${outPrefix}.txt`;
    if (existsSync(txtPath)) {
      return readFileSync(txtPath, 'utf8').trim();
    }
    return null;
  } catch {
    return null;
  }
}

/** Se há suporte a transcrição de áudio nesta máquina (binário + modelo). */
export async function hasAudioTranscription(): Promise<boolean> {
  const hasBin =
    (await resolveBinary('whisper-cli')) !== null ||
    (await resolveBinary('whisper-cpp')) !== null ||
    (await resolveBinary('whisper')) !== null;
  return hasBin && findWhisperModel() !== null;
}

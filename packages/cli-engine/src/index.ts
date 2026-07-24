/**
 * @llm-proxy/cli-engine — núcleo de detecção e execução das LLM CLIs.
 *
 * - platform: abstração multi-OS (detecção de binário, spawn, env allowlist)
 * - detect: detecção das CLIs instaladas
 * - registry: metadados por CLI (binário, capabilities, models)
 * - adapters: tradução por CLI (buildArgs + parseLine)
 * - runner: execução one-shot com streaming de eventos normalizados
 */
export * from './platform/index.js';
export * from './registry.js';
export * from './detect.js';
export * from './adapters/index.js';
export * from './runner.js';
export * from './pool/index.js';
export * from './usage.js';
export * from './attachments.js';
export * from './transcribe.js';
export * from './image-gen.js';
export * from './setup/index.js';
export * from './sources/index.js';

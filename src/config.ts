import type { BridgeConfig } from './types.js';
import { DEFAULT_SCOPE } from './types.js';
import { expand } from './paths.js';

export const MIN_POLL_MS = 1000;

export function loadScanMaxAgeMs(): number | undefined {
  const raw = process.env.IIITERM_SCAN_MAX_AGE_MS;
  if (!raw) return undefined;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function loadConfig(): BridgeConfig {
  const rawPoll = Number(process.env.IIITERM_POLL_MS ?? 1000);
  const pollMs = Number.isFinite(rawPoll) && rawPoll >= MIN_POLL_MS ? rawPoll : MIN_POLL_MS;

  return {
    engineUrl: process.env.IIITERM_ENGINE_URL ?? 'ws://127.0.0.1:49134',
    stateScope: process.env.IIITERM_STATE_SCOPE ?? DEFAULT_SCOPE,
    pollMs,
    claudeProjectsDir: expand(
      process.env.CLAUDE_PROJECTS_DIR ?? '~/.claude/projects',
    ),
    codexSessionsDir: expand(
      process.env.CODEX_SESSIONS_DIR ?? '~/.codex/sessions',
    ),
    opencodeDbPath: expand(
      process.env.OPENCODE_DB_PATH ?? '~/.local/share/opencode/opencode.db',
    ),
    ampThreadsDir: expand(
      process.env.AMP_THREADS_DIR ?? '~/.local/share/amp/threads',
    ),
  };
}

export function cronEveryPoll(pollMs: number): string {
  const seconds = Math.max(1, Math.round(pollMs / 1000));
  return `*/${seconds} * * * * *`;
}

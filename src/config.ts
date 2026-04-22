import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { BridgeConfig } from './types.js';
import { DEFAULT_SCOPE } from './types.js';

function expand(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(1).replace(/^\//, ''));
  return resolve(p);
}

export function loadConfig(): BridgeConfig {
  return {
    engineUrl: process.env.IIITERM_ENGINE_URL ?? 'ws://127.0.0.1:49134',
    stateScope: process.env.IIITERM_STATE_SCOPE ?? DEFAULT_SCOPE,
    pollMs: Number(process.env.IIITERM_POLL_MS ?? 1000),
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

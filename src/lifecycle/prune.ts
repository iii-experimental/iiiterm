import type { SessionState, SessionStatus } from '../types.js';

export interface PruneThresholds {
  runningMs: number;
  waitingMs: number;
  terminalMs: number;
  idleMs: number;
}

export const DEFAULT_THRESHOLDS: PruneThresholds = {
  runningMs: 3 * 60_000,
  waitingMs: 3 * 60_000,
  terminalMs: 5 * 60_000,
  idleMs: 30 * 60_000,
};

function cutoffFor(status: SessionStatus, t: PruneThresholds): number {
  switch (status) {
    case 'running':
      return t.runningMs;
    case 'waiting':
      return t.waitingMs;
    case 'done':
    case 'error':
    case 'interrupted':
      return t.terminalMs;
    case 'idle':
    default:
      return t.idleMs;
  }
}

export interface PruneDecision {
  id: string;
  reason: string;
}

export function decidePrunable(
  sessions: SessionState[],
  now: number,
  thresholds: PruneThresholds = DEFAULT_THRESHOLDS,
): PruneDecision[] {
  const out: PruneDecision[] = [];
  for (const s of sessions) {
    const lastActivity = s.lastTurnAt ?? s.updatedAt;
    const cutoff = cutoffFor(s.status, thresholds);
    const age = now - lastActivity;
    if (age > cutoff) {
      out.push({
        id: s.id,
        reason: `status=${s.status} age=${Math.round(age / 1000)}s > ${Math.round(cutoff / 1000)}s`,
      });
    }
  }
  return out;
}

export function loadThresholds(env: NodeJS.ProcessEnv): PruneThresholds {
  const n = (key: string, d: number): number => {
    const raw = env[key];
    if (!raw) return d;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    runningMs: n('IIITERM_PRUNE_RUNNING_MS', DEFAULT_THRESHOLDS.runningMs),
    waitingMs: n('IIITERM_PRUNE_WAITING_MS', DEFAULT_THRESHOLDS.waitingMs),
    terminalMs: n('IIITERM_PRUNE_TERMINAL_MS', DEFAULT_THRESHOLDS.terminalMs),
    idleMs: n('IIITERM_PRUNE_IDLE_MS', DEFAULT_THRESHOLDS.idleMs),
  };
}

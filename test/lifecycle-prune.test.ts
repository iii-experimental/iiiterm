import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  decidePrunable,
  loadThresholds,
} from '../src/lifecycle/prune.js';
import type { SessionState } from '../src/types.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function sess(partial: Partial<SessionState> & Pick<SessionState, 'id' | 'status' | 'lastTurnAt'>): SessionState {
  return {
    agent: 'claude-code',
    updatedAt: partial.lastTurnAt,
    ...partial,
  } as SessionState;
}

describe('decidePrunable', () => {
  const now = 1_700_000_000_000;

  it('drops running sessions older than runningMs', () => {
    const out = decidePrunable(
      [
        sess({ id: 'fresh', status: 'running', lastTurnAt: now - 1_000 }),
        sess({ id: 'stale', status: 'running', lastTurnAt: now - 5 * 60_000 }),
      ],
      now,
    );
    expect(out.map((d) => d.id)).toEqual(['stale']);
  });

  it('drops terminal sessions older than terminalMs', () => {
    const out = decidePrunable(
      [
        sess({ id: 'done-fresh', status: 'done', lastTurnAt: now - 60_000 }),
        sess({ id: 'done-stale', status: 'done', lastTurnAt: now - 10 * 60_000 }),
        sess({ id: 'err-stale', status: 'error', lastTurnAt: now - 7 * 60_000 }),
      ],
      now,
    );
    expect(out.map((d) => d.id).sort()).toEqual(['done-stale', 'err-stale']);
  });

  it('keeps idle sessions until idleMs (default 30 min)', () => {
    const out = decidePrunable(
      [
        sess({ id: 'idle-20', status: 'idle', lastTurnAt: now - 20 * 60_000 }),
        sess({ id: 'idle-35', status: 'idle', lastTurnAt: now - 35 * 60_000 }),
      ],
      now,
    );
    expect(out.map((d) => d.id)).toEqual(['idle-35']);
  });

  it('falls back to updatedAt when lastTurnAt is missing', () => {
    const out = decidePrunable(
      [
        {
          id: 'no-turn',
          agent: 'codex',
          status: 'done',
          updatedAt: now - 10 * 60_000,
        },
      ],
      now,
    );
    expect(out.map((d) => d.id)).toEqual(['no-turn']);
  });

  it('reports a human-readable reason', () => {
    const out = decidePrunable(
      [sess({ id: 'x', status: 'running', lastTurnAt: now - 4 * 60_000 })],
      now,
    );
    expect(out[0]?.reason).toMatch(/status=running age=\d+s > \d+s/);
  });
});

describe('loadThresholds', () => {
  it('uses defaults when env is empty', () => {
    const t = loadThresholds({});
    expect(t).toEqual(DEFAULT_THRESHOLDS);
  });

  it('reads positive numeric overrides', () => {
    const t = loadThresholds({
      IIITERM_PRUNE_RUNNING_MS: '9000',
      IIITERM_PRUNE_TERMINAL_MS: '4000',
    });
    expect(t.runningMs).toBe(9000);
    expect(t.terminalMs).toBe(4000);
    expect(t.idleMs).toBe(DEFAULT_THRESHOLDS.idleMs);
  });

  it('falls back on invalid values', () => {
    const t = loadThresholds({ IIITERM_PRUNE_RUNNING_MS: 'banana' });
    expect(t.runningMs).toBe(DEFAULT_THRESHOLDS.runningMs);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from './helpers/mock-sdk.js';
import { evaluateRules, loadFiredSet } from '../src/workers/router-core.js';
import type { SessionState } from '../src/types.js';

/**
 * A1 regression — a router restart must NOT re-fire a rule against a session that
 * already matched before the crash. Fired keys live in engine state, so a freshly
 * loaded Set sees them and skips the duplicate trigger.
 */

const SCOPE_SESSIONS = 'iiiterm:sessions';

describe('router fired-keys survive a restart (regression for A1)', () => {
  let rulesDir: string;
  let rulesPath: string;

  beforeEach(async () => {
    rulesDir = await mkdtemp(join(tmpdir(), 'iiiterm-router-'));
    rulesPath = join(rulesDir, 'router.json');
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'claude-done-wakes-codex',
            when: { agent: 'claude-code', status: 'done' },
            then: { function_id: 'agent::codex::run', payload: { prompt: 'review' } },
          },
        ],
      }),
    );
  });

  afterEach(async () => {
    await rm(rulesDir, { recursive: true, force: true });
  });

  it('fires once, persists, and does not fire again after a simulated restart', async () => {
    const calls: string[] = [];
    const state = new Map<string, Map<string, unknown>>();

    const sessions = new Map<string, SessionState>([
      [
        'sess-1',
        {
          id: 'sess-1',
          agent: 'claude-code',
          status: 'done',
          updatedAt: 1,
        },
      ],
    ]);
    state.set(SCOPE_SESSIONS, sessions as unknown as Map<string, unknown>);

    const onTrigger = (req: { function_id: string }) => {
      if (req.function_id === 'agent::codex::run') {
        calls.push(req.function_id);
        return { ok: true };
      }
      return undefined;
    };

    // Router lifetime #1 — fires once.
    const sdk1 = stubSdk({ onTrigger, state });
    const fired1 = await loadFiredSet(sdk1);
    const first = await evaluateRules(sdk1, fired1, SCOPE_SESSIONS, rulesPath);
    expect(first).toBe(1);
    expect(calls).toEqual(['agent::codex::run']);

    // Router lifetime #2 — fresh in-memory Set, same engine state, same rules.
    const sdk2 = stubSdk({ onTrigger, state });
    const fired2 = await loadFiredSet(sdk2);
    expect(fired2.size).toBe(1);
    const second = await evaluateRules(sdk2, fired2, SCOPE_SESSIONS, rulesPath);
    expect(second).toBe(0);
    expect(calls).toEqual(['agent::codex::run']);
  });

  it('still fires when status transitions to a previously-unseen value', async () => {
    const calls: string[] = [];
    const state = new Map<string, Map<string, unknown>>();
    const sessions = new Map<string, SessionState>([
      [
        'sess-1',
        {
          id: 'sess-1',
          agent: 'claude-code',
          status: 'done',
          updatedAt: 1,
        },
      ],
    ]);
    state.set(SCOPE_SESSIONS, sessions as unknown as Map<string, unknown>);

    const onTrigger = (req: { function_id: string }) => {
      if (req.function_id === 'agent::codex::run') {
        calls.push(req.function_id);
        return { ok: true };
      }
      return undefined;
    };

    const sdk1 = stubSdk({ onTrigger, state });
    const fired1 = await loadFiredSet(sdk1);
    await evaluateRules(sdk1, fired1, SCOPE_SESSIONS, rulesPath);
    expect(calls).toHaveLength(1);

    // Session flips back to running then to done again — with once:true default the
    // same rule+session+status combo should still be deduped. Transition to error
    // is a different key, so that fires.
    const errRules = join(rulesDir, 'router-err.json');
    await writeFile(
      errRules,
      JSON.stringify({
        rules: [
          {
            id: 'claude-error-alert',
            when: { agent: 'claude-code', status: 'error' },
            then: { function_id: 'agent::codex::run', payload: { prompt: 'investigate' } },
          },
        ],
      }),
    );

    sessions.get('sess-1')!.status = 'error';
    const sdk2 = stubSdk({ onTrigger, state });
    const fired2 = await loadFiredSet(sdk2);
    await evaluateRules(sdk2, fired2, SCOPE_SESSIONS, errRules);
    expect(calls).toHaveLength(2);
  });
});

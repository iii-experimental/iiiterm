import { describe, expect, it } from 'vitest';
import { stubSdk } from '../helpers/mock-sdk.js';
import { getSession, listSessions, writeSession } from '../../src/state.js';
import {
  FIRED_SCOPE,
  loadFiredSet,
  markFired,
} from '../../src/workers/router-core.js';
import type { SessionState } from '../../src/types.js';

const SCOPE = 'iiiterm:sessions';

describe('E2E state persistence across sdk restarts', () => {
  it('session writes survive a simulated worker restart when engine state is shared', async () => {
    const state = new Map<string, Map<string, unknown>>();

    const writerSdk = stubSdk({ state });
    const s1: SessionState = {
      id: 's-1',
      agent: 'claude-code',
      status: 'running',
      title: 'ship the thing',
      cwd: '/work/a',
      tokensIn: 100,
      tokensOut: 42,
      updatedAt: Date.now(),
    };
    const s2: SessionState = {
      id: 's-2',
      agent: 'codex',
      status: 'done',
      title: 'bump dep',
      cwd: '/work/b',
      updatedAt: Date.now(),
    };
    await writeSession(writerSdk, SCOPE, s1);
    await writeSession(writerSdk, SCOPE, s2);

    /* simulate a full process restart: new sdk, same engine state */
    const readerSdk = stubSdk({ state });
    const listed = await listSessions(readerSdk, SCOPE);
    const byId = Object.fromEntries(listed.map((s) => [s.id, s]));

    expect(byId['s-1']?.status).toBe('running');
    expect(byId['s-1']?.tokensIn).toBe(100);
    expect(byId['s-2']?.agent).toBe('codex');

    const fetched = await getSession(readerSdk, SCOPE, 's-2');
    expect(fetched?.title).toBe('bump dep');
  });

  it('router fired-keys survive a simulated restart and block re-firing', async () => {
    const state = new Map<string, Map<string, unknown>>();

    const sdk1 = stubSdk({ state });
    await markFired(sdk1, 'rule-a::sess-1::done');
    await markFired(sdk1, 'rule-a::sess-2::error');

    const sdk2 = stubSdk({ state });
    const fired = await loadFiredSet(sdk2);
    expect(fired.size).toBe(2);
    expect(fired.has('rule-a::sess-1::done')).toBe(true);
    expect(fired.has('rule-a::sess-2::error')).toBe(true);

    /* verify the scope name is the one the worker actually uses */
    expect(FIRED_SCOPE).toBe('iiiterm:router:fired');
  });

  it('a delete clears the key across future reads', async () => {
    const state = new Map<string, Map<string, unknown>>();
    const sdk = stubSdk({ state });
    await writeSession(sdk, SCOPE, {
      id: 'gone',
      agent: 'claude-code',
      status: 'idle',
      updatedAt: 1,
    });

    await sdk.trigger({
      function_id: 'state::delete',
      payload: { scope: SCOPE, key: 'gone' },
    });

    const after = stubSdk({ state });
    expect(await getSession(after, SCOPE, 'gone')).toBeNull();
  });

  it('round-trips every SessionState field without loss', async () => {
    const state = new Map<string, Map<string, unknown>>();
    const sdk = stubSdk({ state });
    const full: SessionState = {
      id: 'full',
      agent: 'amp',
      title: 'refactor stream',
      cwd: '/src',
      branch: 'main',
      status: 'waiting',
      lastMessage: 'needs input',
      lastTurnAt: 1_700_000_000_000,
      tokensIn: 1234,
      tokensOut: 567,
      ports: [3000, 5173],
      updatedAt: 1_700_000_000_010,
      unseen: true,
      tmuxTarget: 'main:0.1',
      pid: 42_000,
    };
    await writeSession(sdk, SCOPE, full);
    const back = await getSession(stubSdk({ state }), SCOPE, 'full');
    expect(back).toEqual(full);
  });
});

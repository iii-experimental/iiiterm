import { describe, expect, it } from 'vitest';
import { stubSdk } from '../helpers/mock-sdk.js';
import { listSessions, writeSession } from '../../src/state.js';
import { decidePrunable } from '../../src/lifecycle/prune.js';
import type { SessionState } from '../../src/types.js';

const SCOPE = 'iiiterm:sessions';

describe('E2E bridge-lifecycle pruning', () => {
  it('deletes stale sessions and keeps fresh ones', async () => {
    const now = Date.now();
    const state = new Map<string, Map<string, unknown>>();
    const sdk = stubSdk({ state });

    const fresh: SessionState = {
      id: 'fresh',
      agent: 'claude-code',
      status: 'running',
      lastTurnAt: now - 5_000,
      updatedAt: now,
    };
    const stale: SessionState = {
      id: 'stale',
      agent: 'claude-code',
      status: 'done',
      lastTurnAt: now - 20 * 60_000,
      updatedAt: now - 20 * 60_000,
    };
    await writeSession(sdk, SCOPE, fresh);
    await writeSession(sdk, SCOPE, stale);

    /* replicate the worker logic */
    const loaded = await listSessions(sdk, SCOPE);
    const drops = decidePrunable(loaded, now);
    for (const { id } of drops) {
      await sdk.trigger({
        function_id: 'state::delete',
        payload: { scope: SCOPE, key: id },
      });
    }

    const after = await listSessions(sdk, SCOPE);
    expect(after.map((s) => s.id)).toEqual(['fresh']);
    expect(drops.map((d) => d.id)).toEqual(['stale']);
  });
});

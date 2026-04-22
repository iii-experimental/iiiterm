import { describe, expect, it } from 'vitest';
import { getSession, listSessions, writeSession } from '../src/state.js';
import { stubSdk } from './helpers/mock-sdk.js';
import type { SessionState } from '../src/types.js';

const session: SessionState = {
  id: 'sess-1',
  agent: 'claude-code',
  status: 'idle',
  updatedAt: 123,
};

describe('state helpers', () => {
  it('writeSession persists via state::set', async () => {
    const sdk = stubSdk();
    await writeSession(sdk, 'scope', session);
    const back = await getSession(sdk, 'scope', 'sess-1');
    expect(back?.id).toBe('sess-1');
  });

  it('getSession returns null when missing', async () => {
    const sdk = stubSdk();
    expect(await getSession(sdk, 'scope', 'nope')).toBeNull();
  });

  it('listSessions returns every written session', async () => {
    const sdk = stubSdk();
    await writeSession(sdk, 'scope', session);
    await writeSession(sdk, 'scope', { ...session, id: 'sess-2' });
    const list = await listSessions(sdk, 'scope');
    expect(list.map((s) => s.id).sort()).toEqual(['sess-1', 'sess-2']);
  });
});

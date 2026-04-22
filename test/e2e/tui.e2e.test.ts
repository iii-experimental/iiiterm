import { describe, expect, it } from 'vitest';
import { stubSdk } from '../helpers/mock-sdk.js';
import { listSessions, writeSession } from '../../src/state.js';
import { renderPane } from '../../src/render.js';

const SCOPE = 'iiiterm:sessions';

describe('E2E TUI renders live state', () => {
  it('renders every session that is in the sessions scope', async () => {
    const sdk = stubSdk();
    await writeSession(sdk, SCOPE, {
      id: 'a',
      agent: 'claude-code',
      status: 'running',
      title: 'refactor billing',
      cwd: '/tmp/a',
      lastTurnAt: Date.now() - 1500,
      updatedAt: Date.now(),
    });
    await writeSession(sdk, SCOPE, {
      id: 'b',
      agent: 'codex',
      status: 'done',
      title: 'bump dep',
      cwd: '/tmp/b',
      lastTurnAt: Date.now() - 120_000,
      updatedAt: Date.now(),
    });

    const sessions = await listSessions(sdk, SCOPE);
    const out = renderPane(sessions, { selectedIndex: 0, footer: 'state live' });

    expect(out).toContain('refactor billing');
    expect(out).toContain('bump dep');
    expect(out).toContain('claude');
    expect(out).toContain('codex');
    expect(out).toContain('state live');
    expect(out).toContain('\x1b[7m');
  });
});

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { scanCodexSessions } from '../../src/watchers/codex.js';
import { listSessions, writeSession } from '../../src/state.js';

const SCOPE = 'iiiterm:sessions';

describe('E2E bridge-codex', () => {
  it('parses rollouts and lands them in engine state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-codex-'));
    try {
      const rollout = {
        session: { id: 'rollout-e2e', timestamp: new Date().toISOString() },
        turn_context: { cwd: '/tmp/proj' },
        items: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'ship it' }],
            timestamp: new Date().toISOString(),
          },
        ],
      };
      await writeFile(join(root, 'rollout-e2e.json'), JSON.stringify(rollout));

      const sdk = stubSdk();
      const scanned = await scanCodexSessions(root);
      for (const s of scanned) await writeSession(sdk, SCOPE, s);

      const sessions = await listSessions(sdk, SCOPE);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe('rollout-e2e');
      expect(sessions[0]?.cwd).toBe('/tmp/proj');
      expect(sessions[0]?.agent).toBe('codex');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

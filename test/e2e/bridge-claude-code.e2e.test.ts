import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { scanClaudeProjects } from '../../src/watchers/claude-code.js';
import { listSessions, writeSession } from '../../src/state.js';

const SCOPE = 'iiiterm:sessions';

async function makeProject(
  root: string,
  proj: string,
  sessionId: string,
  lines: unknown[],
): Promise<void> {
  const dir = join(root, proj);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${sessionId}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join('\n'),
  );
}

describe('E2E bridge-claude-code', () => {
  it('round-trips two transcripts from disk to engine state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-cc-'));
    try {
      await makeProject(root, 'proj-a', 'abc', [
        {
          role: 'user',
          sessionId: 'abc',
          cwd: '/work/a',
          message: { content: 'write a doc' },
          timestamp: new Date(Date.now() - 2000).toISOString(),
        },
        {
          role: 'assistant',
          sessionId: 'abc',
          message: { content: [{ type: 'text', text: 'done' }] },
          usage: { input_tokens: 10, output_tokens: 20 },
          timestamp: new Date().toISOString(),
        },
      ]);
      await makeProject(root, 'proj-b', 'xyz', [
        {
          role: 'user',
          sessionId: 'xyz',
          cwd: '/work/b',
          message: { content: 'fix bug' },
          timestamp: new Date().toISOString(),
        },
      ]);

      const sdk = stubSdk();
      const scanned = await scanClaudeProjects(root);
      for (const s of scanned) await writeSession(sdk, SCOPE, s);

      const sessions = await listSessions(sdk, SCOPE);
      expect(sessions.map((s) => s.id).sort()).toEqual(['abc', 'xyz']);
      expect(sessions.find((s) => s.id === 'abc')?.tokensOut).toBe(20);
      expect(sessions.find((s) => s.id === 'xyz')?.status).toBe('waiting');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

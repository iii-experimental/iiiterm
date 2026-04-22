import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanClaudeProjects } from '../../src/watchers/claude-code.js';

async function makeProjectsDir(
  contents: Record<string, string[]>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'iiiterm-cc-'));
  for (const [proj, files] of Object.entries(contents)) {
    const dir = join(root, proj);
    await mkdir(dir, { recursive: true });
    for (const [i, body] of files.entries()) {
      await writeFile(join(dir, `sess-${i}.jsonl`), body);
    }
  }
  return root;
}

describe('scanClaudeProjects', () => {
  it('returns [] when the directory is missing', async () => {
    const out = await scanClaudeProjects('/definitely/nope');
    expect(out).toEqual([]);
  });

  it('parses a transcript with user message + assistant turn', async () => {
    const lines = [
      JSON.stringify({
        role: 'user',
        sessionId: 'abc',
        cwd: '/tmp/ws',
        message: { content: 'hello there' },
        timestamp: new Date(Date.now() - 2000).toISOString(),
      }),
      JSON.stringify({
        role: 'assistant',
        sessionId: 'abc',
        message: { content: [{ type: 'text', text: 'hi back' }] },
        usage: { input_tokens: 100, output_tokens: 50 },
        timestamp: new Date().toISOString(),
      }),
    ].join('\n');

    const root = await makeProjectsDir({ proj: [lines] });
    try {
      const out = await scanClaudeProjects(root);
      expect(out).toHaveLength(1);
      const session = out[0]!;
      expect(session.id).toBe('abc');
      expect(session.agent).toBe('claude-code');
      expect(session.cwd).toBe('/tmp/ws');
      expect(session.tokensIn).toBe(100);
      expect(session.tokensOut).toBe(50);
      expect(session.title).toBe('hello there');
      expect(session.lastMessage).toBe('hi back');
      expect(session.status).toBe('running');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('marks a session as error when the last entry has isError', async () => {
    const line = JSON.stringify({
      role: 'assistant',
      sessionId: 'z',
      isError: true,
      message: { content: 'boom' },
      timestamp: new Date().toISOString(),
    });
    const root = await makeProjectsDir({ p: [line] });
    try {
      const [session] = await scanClaudeProjects(root);
      expect(session?.status).toBe('error');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('survives unparseable lines in the middle of a transcript', async () => {
    const good = JSON.stringify({
      role: 'user',
      sessionId: 'mix',
      message: { content: 'hi' },
      timestamp: new Date().toISOString(),
    });
    const root = await makeProjectsDir({ p: [`${good}\n{not json\n${good}`] });
    try {
      const [session] = await scanClaudeProjects(root);
      expect(session?.id).toBe('mix');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores non-jsonl files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'iiiterm-cc-'));
    const dir = join(root, 'proj');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'notes.md'), '# notes');
    try {
      expect(await scanClaudeProjects(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

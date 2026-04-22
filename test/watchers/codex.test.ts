import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCodexSessions } from '../../src/watchers/codex.js';

async function write(rootPrefix: string, filename: string, body: string) {
  const root = await mkdtemp(join(tmpdir(), rootPrefix));
  await writeFile(join(root, filename), body);
  return root;
}

describe('scanCodexSessions', () => {
  it('returns [] when the directory is missing', async () => {
    expect(await scanCodexSessions('/definitely/nope')).toEqual([]);
  });

  it('parses a rollout with user + assistant items', async () => {
    const rollout = {
      session: {
        id: 'rollout-xyz',
        timestamp: new Date(Date.now() - 20_000).toISOString(),
      },
      turn_context: { cwd: '/work/rep' },
      items: [
        {
          role: 'user',
          type: 'message',
          content: [{ type: 'input_text', text: 'make a thing' }],
          timestamp: new Date(Date.now() - 15_000).toISOString(),
        },
        {
          role: 'assistant',
          type: 'message',
          content: [{ type: 'output_text', text: 'ok, doing it' }],
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const root = await write('iiiterm-codex-', 'rollout-xyz.json', JSON.stringify(rollout));
    try {
      const [session] = await scanCodexSessions(root);
      expect(session?.id).toBe('rollout-xyz');
      expect(session?.agent).toBe('codex');
      expect(session?.cwd).toBe('/work/rep');
      expect(session?.title).toBe('make a thing');
      expect(session?.lastMessage).toBe('ok, doing it');
      expect(session?.status).toBe('running');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns [] for malformed JSON', async () => {
    const root = await write('iiiterm-codex-', 'rollout-bad.json', '{broken');
    try {
      expect(await scanCodexSessions(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the filename when session.id is absent', async () => {
    const rollout = { items: [{ role: 'user', content: 'hi' }] };
    const root = await write('iiiterm-codex-', 'rollout-fallback.json', JSON.stringify(rollout));
    try {
      const [session] = await scanCodexSessions(root);
      expect(session?.id).toBe('rollout-fallback');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

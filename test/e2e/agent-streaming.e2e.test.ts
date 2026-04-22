import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFakeBin } from './helpers/fake-bin.js';
import { runAgent, type AgentChunkSource } from '../../src/agents/run.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-stream-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E agent streaming via onChunk', () => {
  it('delivers stdout chunks incrementally before process exit', async () => {
    const bin = await writeFakeBin(
      tmpDir,
      'stream-cli',
      `for i in 1 2 3 4; do
         printf 'chunk-%s\\n' "$i"
         sleep 0.05
       done`,
    );

    const chunks: Array<{ text: string; source: AgentChunkSource; at: number }> = [];
    const started = Date.now();
    const res = await runAgent(
      { bin, args: () => [] },
      {
        prompt: 'p',
        onChunk: (text, source) =>
          chunks.push({ text, source, at: Date.now() - started }),
      },
    );

    expect(res.ok).toBe(true);
    expect(res.text).toContain('chunk-1');
    expect(res.text).toContain('chunk-4');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.every((c) => c.source === 'stdout')).toBe(true);
  });

  it('routes stderr chunks through the same hook with source=stderr', async () => {
    const bin = await writeFakeBin(
      tmpDir,
      'err-cli',
      `printf 'ok\\n'\nprintf 'boom\\n' >&2\nexit 0`,
    );
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const res = await runAgent(
      { bin, args: () => [] },
      {
        prompt: 'p',
        onChunk: (text, source) => {
          if (source === 'stdout') stdoutChunks.push(text);
          else stderrChunks.push(text);
        },
      },
    );
    expect(res.ok).toBe(true);
    expect(stdoutChunks.join('')).toContain('ok');
    expect(stderrChunks.join('')).toContain('boom');
  });

  it('buffers nothing when onChunk is absent (back-compat)', async () => {
    const bin = await writeFakeBin(
      tmpDir,
      'plain',
      `printf 'hello'`,
    );
    const res = await runAgent({ bin, args: () => [] }, { prompt: 'p' });
    expect(res.text).toBe('hello');
  });
});

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWholeOrTail, TAIL_CHUNK, TAIL_THRESHOLD } from '../../src/watchers/tail.js';

describe('readWholeOrTail', () => {
  it('returns the whole file when size is under threshold', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-tail-'));
    const p = join(dir, 'small.txt');
    await writeFile(p, 'hello world');
    try {
      const r = await readWholeOrTail(p, 11);
      expect(r.tailed).toBe(false);
      expect(r.text).toBe('hello world');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns only a trailing chunk for large files and drops a partial leading line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-tail-'));
    const p = join(dir, 'big.jsonl');

    const header = 'x'.repeat(TAIL_THRESHOLD);
    const tailLines = [
      '{"tail":"partial-line-that-should-get-sliced"}',
      '{"role":"user"}',
      '{"role":"assistant"}',
    ].join('\n');
    const body = `${header}\n${tailLines}`;
    await writeFile(p, body);

    try {
      const r = await readWholeOrTail(p, body.length);
      expect(r.tailed).toBe(true);
      expect(r.text.length).toBeLessThanOrEqual(TAIL_CHUNK);
      expect(r.text).toContain('assistant');
      expect(r.text.startsWith('{')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

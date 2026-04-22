import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFakeBin } from './helpers/fake-bin.js';
import { runAgent } from '../../src/agents/run.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-agent-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E agent workers', () => {
  it('claude-worker argv: -p --output-format text -- <prompt> survives a dash-prefixed prompt', async () => {
    const bin = await writeFakeBin(
      tmpDir,
      'fake-claude',
      'printf "args=%s\\n" "$*"\nprintf "last=%s" "${!#}"',
    );
    const res = await runAgent(
      {
        bin,
        args: (i) => ['-p', '--output-format', 'text', '--', i.prompt],
      },
      { prompt: '-looks-like-a-flag-but-is-a-prompt' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toContain('last=-looks-like-a-flag-but-is-a-prompt');
  });

  it('amp-worker sends the prompt via stdin without an argv prompt slot', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-amp', 'cat');
    const res = await runAgent(
      { bin, args: () => [], usesStdin: true },
      { prompt: 'piped via stdin' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('piped via stdin');
  });

  it('codex-worker argv: exec -- <prompt>', async () => {
    const bin = await writeFakeBin(
      tmpDir,
      'fake-codex',
      'printf "sub=%s last=%s" "$1" "${!#}"',
    );
    const res = await runAgent(
      { bin, args: (i) => ['exec', '--', i.prompt] },
      { prompt: 'hello' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('sub=exec last=hello');
  });

  it('surfaces non-zero exit and stderr', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-fail', 'echo boom >&2\nexit 7');
    const res = await runAgent({ bin, args: () => [] }, { prompt: 'p' });
    expect(res.ok).toBe(false);
    expect(res.exit_code).toBe(7);
    expect(res.stderr).toContain('boom');
  });
});

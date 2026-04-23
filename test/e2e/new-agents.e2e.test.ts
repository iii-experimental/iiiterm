import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFakeBin } from './helpers/fake-bin.js';
import { runAgent } from '../../src/agents/run.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-new-agents-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E new agent wrappers argv shape', () => {
  it('gemini-worker passes --prompt -- <prompt>', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-gemini', 'printf "args=%s" "$*"');
    const res = await runAgent(
      { bin, args: (i) => ['--prompt', '--', i.prompt] },
      { prompt: 'hi' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('args=--prompt -- hi');
  });

  it('cursor-worker passes -p -- <prompt>', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-cursor', 'printf "%s" "$*"');
    const res = await runAgent({ bin, args: (i) => ['-p', '--', i.prompt] }, { prompt: 'go' });
    expect(res.ok).toBe(true);
    expect(res.text).toBe('-p -- go');
  });

  it('copilot-worker passes gh copilot suggest argv', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-gh', 'printf "%s" "$*"');
    const res = await runAgent(
      { bin, args: (i) => ['copilot', 'suggest', '-t', 'shell', '--', i.prompt] },
      { prompt: 'list files' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('copilot suggest -t shell -- list files');
  });

  it('aider-worker passes --yes-always --message <prompt>', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-aider', 'printf "%s" "$*"');
    const res = await runAgent(
      { bin, args: (i) => ['--yes-always', '--message', i.prompt] },
      { prompt: 'fix it' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('--yes-always --message fix it');
  });

  it('qwen-worker passes --prompt -- <prompt>', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-qwen', 'printf "%s" "$*"');
    const res = await runAgent(
      { bin, args: (i) => ['--prompt', '--', i.prompt] },
      { prompt: 'ship' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('--prompt -- ship');
  });

  it('generic-agent-worker substitutes {{prompt}} in the argv template', async () => {
    const bin = await writeFakeBin(tmpDir, 'fake-generic', 'printf "%s" "$*"');
    const tpl = '--mode exec -- {{prompt}}';
    const templated = tpl
      .split(/\s+/)
      .filter(Boolean)
      .map((a) => a.replace(/\{\{\s*prompt\s*\}\}/g, 'do stuff'));
    const res = await runAgent(
      { bin, args: () => templated },
      { prompt: 'do stuff' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('--mode exec -- do stuff');
  });
});

import { describe, expect, it } from 'vitest';
import { runAgent } from '../../src/agents/run.js';

describe('runAgent', () => {
  it('rejects an empty prompt', async () => {
    const res = await runAgent({ bin: 'true', args: () => [] }, { prompt: '' });
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain('prompt is required');
    expect(res.exit_code).toBeNull();
  });

  it('runs a happy-path command and captures stdout', async () => {
    const res = await runAgent(
      { bin: 'sh', args: (i) => ['-c', `printf "%s" "${i.prompt}"`] },
      { prompt: 'hello' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('hello');
    expect(res.exit_code).toBe(0);
  });

  it('captures non-zero exits as ok:false', async () => {
    const res = await runAgent(
      { bin: 'sh', args: () => ['-c', 'echo oops >&2; exit 3'] },
      { prompt: 'p' },
    );
    expect(res.ok).toBe(false);
    expect(res.exit_code).toBe(3);
    expect(res.stderr).toContain('oops');
  });

  it('enforces the timeout', async () => {
    const res = await runAgent(
      { bin: 'sh', args: () => ['-c', 'sleep 5'] },
      { prompt: 'p', timeoutMs: 200 },
    );
    expect(res.ok).toBe(false);
    expect(res.elapsed_ms).toBeLessThan(3_000);
  });

  it('pipes the prompt via stdin when usesStdin is set', async () => {
    const res = await runAgent(
      { bin: 'cat', args: () => [], usesStdin: true },
      { prompt: 'piped-prompt' },
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('piped-prompt');
  });

  it('reports a spawn error when the binary is missing', async () => {
    const res = await runAgent(
      { bin: '/no/such/bin/iiiterm-ghost', args: () => [] },
      { prompt: 'p' },
    );
    expect(res.ok).toBe(false);
    expect(res.exit_code).toBeNull();
    expect(res.stderr).toContain('spawn error');
  });
});

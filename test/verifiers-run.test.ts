import { describe, expect, it } from 'vitest';
import { runShell } from '../src/verifiers/run.js';

describe('runShell', () => {
  it('reports pass=true on exit 0', async () => {
    const r = await runShell('exit 0', { cwd: process.cwd() });
    expect(r.pass).toBe(true);
    expect(r.exit_code).toBe(0);
    expect(r.reason).toBeUndefined();
  });

  it('reports pass=false with reason on non-zero exit', async () => {
    const r = await runShell('exit 7', { cwd: process.cwd() });
    expect(r.pass).toBe(false);
    expect(r.exit_code).toBe(7);
    expect(r.reason).toBe('exit 7');
  });

  it('captures stdout and stderr', async () => {
    const r = await runShell('echo hi; echo boom >&2; exit 0', { cwd: process.cwd() });
    expect(r.pass).toBe(true);
    expect(r.stdout).toContain('hi');
    expect(r.stderr).toContain('boom');
  });

  it('kills on timeout and marks pass=false', async () => {
    const r = await runShell('sleep 5', { cwd: process.cwd(), timeoutMs: 150 });
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('timeout');
    expect(r.elapsed_ms).toBeLessThan(3000);
  });
});

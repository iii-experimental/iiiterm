import { spawn } from 'node:child_process';

export interface VerifierInput {
  cwd: string;
  command?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface VerifierResult {
  pass: boolean;
  reason?: string;
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  elapsed_ms: number;
}

export async function runShell(
  command: string,
  input: VerifierInput,
): Promise<VerifierResult> {
  const started = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    let killed = false;
    let timeoutHandle: NodeJS.Timeout | null = null;
    if (input.timeoutMs && input.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1500).unref();
      }, input.timeoutMs);
    }

    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const elapsed = Date.now() - started;
      resolvePromise({
        pass: !killed && code === 0,
        reason: killed ? 'timeout' : code === 0 ? undefined : `exit ${code}`,
        command,
        exit_code: code,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
        elapsed_ms: elapsed,
      });
    });
    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolvePromise({
        pass: false,
        reason: `spawn error: ${String(err)}`,
        command,
        exit_code: null,
        stdout,
        stderr,
        elapsed_ms: Date.now() - started,
      });
    });
  });
}

export interface WrappedOutcome extends VerifierResult {
  ts: number;
}

export function outcome(result: VerifierResult): WrappedOutcome {
  return { ...result, ts: Date.now() };
}

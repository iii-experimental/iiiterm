import { spawn } from 'node:child_process';

export interface AgentRunInput {
  prompt: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
}

export interface AgentRunResult {
  ok: boolean;
  text: string;
  stderr: string;
  exit_code: number | null;
  elapsed_ms: number;
}

export interface AgentCommand {
  bin: string;
  args: (input: AgentRunInput) => string[];
  usesStdin?: boolean;
}

export async function runAgent(
  cmd: AgentCommand,
  input: AgentRunInput,
): Promise<AgentRunResult> {
  if (!input?.prompt) {
    return {
      ok: false,
      text: '',
      stderr: 'prompt is required',
      exit_code: null,
      elapsed_ms: 0,
    };
  }

  const started = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(cmd.bin, cmd.args(input), {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: [cmd.usesStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    let timeoutHandle: NodeJS.Timeout | null = null;
    if (input.timeoutMs && input.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1500).unref();
      }, input.timeoutMs);
    }

    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolvePromise({
        ok: code === 0,
        text: stdout,
        stderr,
        exit_code: code,
        elapsed_ms: Date.now() - started,
      });
    });

    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolvePromise({
        ok: false,
        text: stdout,
        stderr: `${stderr}\nspawn error: ${String(err)}`.trim(),
        exit_code: null,
        elapsed_ms: Date.now() - started,
      });
    });

    if (cmd.usesStdin && child.stdin) {
      child.stdin.write(input.stdin ?? input.prompt);
      child.stdin.end();
    }
  });
}

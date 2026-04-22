import { spawn } from 'node:child_process';

export interface TmuxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export async function tmux(args: string[]): Promise<TmuxResult> {
  return new Promise((resolvePromise) => {
    const child = spawn('tmux', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolvePromise({ ok: code === 0, stdout, stderr, code });
    });
    child.on('error', () => {
      resolvePromise({ ok: false, stdout, stderr, code: null });
    });
  });
}

export async function killPane(target: string): Promise<TmuxResult> {
  return tmux(['kill-pane', '-t', target]);
}

export async function focusPane(target: string): Promise<TmuxResult> {
  return tmux(['select-pane', '-t', target]);
}

export async function sendKeys(target: string, text: string): Promise<TmuxResult> {
  return tmux(['send-keys', '-t', target, text, 'Enter']);
}

export async function listPanes(): Promise<string[]> {
  const res = await tmux([
    'list-panes',
    '-a',
    '-F',
    '#{session_name}:#{window_index}.#{pane_index}\t#{pane_pid}\t#{pane_current_command}',
  ]);
  if (!res.ok) return [];
  return res.stdout.split('\n').filter(Boolean);
}

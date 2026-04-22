import { spawn } from 'node:child_process';

export interface TmuxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface TmuxPaneInfo {
  target: string;
  pid: number;
  command: string;
  currentPath: string;
}

function tmuxBin(): string {
  return process.env.IIITERM_TMUX_BIN ?? 'tmux';
}

export async function tmux(args: string[]): Promise<TmuxResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(tmuxBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

const PANE_FORMAT =
  '#{session_name}:#{window_index}.#{pane_index}\t#{pane_pid}\t#{pane_current_command}\t#{pane_current_path}';

export async function listPanes(): Promise<TmuxPaneInfo[]> {
  const res = await tmux(['list-panes', '-a', '-F', PANE_FORMAT]);
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [target, pidStr, command, currentPath] = line.split('\t');
      return {
        target: target ?? '',
        pid: Number(pidStr) || 0,
        command: command ?? '',
        currentPath: currentPath ?? '',
      } satisfies TmuxPaneInfo;
    });
}

const AGENT_BIN_MAP: Record<string, string[]> = {
  'claude-code': ['claude', 'claude-code'],
  codex: ['codex'],
  opencode: ['opencode'],
  amp: ['amp'],
};

export function paneMatchesAgent(
  pane: TmuxPaneInfo,
  agent: keyof typeof AGENT_BIN_MAP,
): boolean {
  const bins = AGENT_BIN_MAP[agent] ?? [];
  return bins.some((b) => pane.command === b || pane.command.endsWith(`/${b}`));
}

export function pickPaneForSession(
  panes: TmuxPaneInfo[],
  agent: keyof typeof AGENT_BIN_MAP,
  cwd: string | undefined,
): TmuxPaneInfo | undefined {
  const agentMatches = panes.filter((p) => paneMatchesAgent(p, agent));
  if (agentMatches.length === 0) return undefined;
  if (!cwd) return agentMatches[0];
  const exact = agentMatches.find((p) => p.currentPath === cwd);
  if (exact) return exact;
  const prefix = agentMatches.find(
    (p) => cwd.startsWith(p.currentPath) || p.currentPath.startsWith(cwd),
  );
  return prefix ?? agentMatches[0];
}

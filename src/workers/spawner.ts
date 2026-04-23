import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { iiitermHost } from '../host.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { sendKeys, tmux } from '../tmux.js';
import { writeSession } from '../state.js';
import type { AgentKind, SessionState } from '../types.js';

interface SpawnInput {
  agent: AgentKind;
  prompt: string;
  cwd: string;
  role?: string;
  sessionName?: string;
  layout?: 'split-horizontal' | 'split-vertical' | 'new-window';
  title?: string;
  worktreePath?: string;
}

interface SpawnResult {
  ok: boolean;
  reason?: string;
  id?: string;
  tmuxTarget?: string;
}

const AGENT_BIN: Record<AgentKind, string> = {
  'claude-code': process.env.IIITERM_CLAUDE_BIN ?? 'claude',
  codex: process.env.IIITERM_CODEX_BIN ?? 'codex',
  opencode: process.env.IIITERM_OPENCODE_BIN ?? 'opencode',
  amp: process.env.IIITERM_AMP_BIN ?? 'amp',
  gemini: process.env.IIITERM_GEMINI_BIN ?? 'gemini',
  cursor: process.env.IIITERM_CURSOR_BIN ?? 'cursor-agent',
  copilot: process.env.IIITERM_COPILOT_BIN ?? 'gh',
  aider: process.env.IIITERM_AIDER_BIN ?? 'aider',
  qwen: process.env.IIITERM_QWEN_BIN ?? 'qwen',
  openclaw: process.env.IIITERM_OPENCLAW_BIN ?? 'openclaw',
  hermes: process.env.IIITERM_HERMES_BIN ?? 'hermes',
};

function sanitize(text: string): string {
  return text.replace(/\r?\n/g, ' ').trim();
}

async function spawnAgentPane(input: SpawnInput): Promise<SpawnResult> {
  const bin = AGENT_BIN[input.agent];
  const layout = input.layout ?? 'split-horizontal';

  let args: string[];
  switch (layout) {
    case 'new-window':
      args = ['new-window', '-P', '-F', '#{session_name}:#{window_index}.#{pane_index}', '-c', input.cwd];
      break;
    case 'split-vertical':
      args = ['split-window', '-v', '-P', '-F', '#{session_name}:#{window_index}.#{pane_index}', '-c', input.cwd];
      break;
    case 'split-horizontal':
    default:
      args = ['split-window', '-h', '-P', '-F', '#{session_name}:#{window_index}.#{pane_index}', '-c', input.cwd];
      break;
  }
  if (input.sessionName) args.splice(1, 0, '-t', input.sessionName);
  args.push(bin);

  const r = await tmux(args);
  if (!r.ok) return { ok: false, reason: r.stderr.trim() || 'tmux spawn failed' };

  const tmuxTarget = r.stdout.trim();
  if (!tmuxTarget) return { ok: false, reason: 'tmux returned no pane target' };

  if (input.title) await tmux(['select-pane', '-t', tmuxTarget, '-T', input.title]);

  await new Promise((r2) => setTimeout(r2, 400));

  const sent = await sendKeys(tmuxTarget, sanitize(input.prompt));
  if (!sent.ok) return { ok: false, reason: sent.stderr.trim() || 'send-keys failed' };

  const id = `spawn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { ok: true, id, tmuxTarget };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-spawner',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::spawn::agent',
    async (input: SpawnInput) => {
      const r = await spawnAgentPane(input);
      if (!r.ok || !r.id) return r;
      const seeded: SessionState = {
        id: r.id,
        agent: input.agent,
        title: input.title ?? input.role ?? input.prompt.slice(0, 80),
        cwd: input.cwd,
        status: 'running',
        tmuxTarget: r.tmuxTarget,
        lastTurnAt: Date.now(),
        updatedAt: Date.now(),
        unseen: false,
        host: iiitermHost(),
        role: input.role,
        worktreePath: input.worktreePath,
      };
      await writeSession(iii, cfg.stateScope, seeded);
      return r;
    },
    {
      description:
        'Spawn an agent CLI into a new tmux pane/window and seed a SessionState so bridges + TUI pick it up immediately.',
    },
  );

  process.stdout.write(`[iiiterm] spawner up · engine ${cfg.engineUrl}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] spawner failed: ${String(err)}\n`);
  process.exit(1);
});

import { registerWorker, type ISdk } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { getSession, writeSession } from '../state.js';
import { focusPane, killPane, sendKeys } from '../tmux.js';
import type { SessionState } from '../types.js';

interface ByIdPayload {
  id: string;
}

interface ResendPayload extends ByIdPayload {
  prompt?: string;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function resolveSession(
  iii: ISdk,
  scope: string,
  id: string,
): Promise<SessionState | null> {
  return getSession(iii, scope, id);
}

function sanitizePrompt(text: string): string {
  return text.replace(/\r?\n/g, ' ').trim();
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-actions',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::session::kill',
    async (input: ByIdPayload) => {
      const s = await resolveSession(iii, cfg.stateScope, input.id);
      if (!s) return { ok: false, reason: 'session not found' };

      if (s.tmuxTarget) {
        const r = await killPane(s.tmuxTarget);
        if (!r.ok) return { ok: false, reason: r.stderr.trim() || 'tmux kill-pane failed' };
        await writeSession(iii, cfg.stateScope, {
          ...s,
          status: 'interrupted',
          updatedAt: Date.now(),
        });
        return { ok: true, via: 'tmux', target: s.tmuxTarget };
      }

      if (s.pid) {
        try {
          process.kill(s.pid, 'SIGTERM');
        } catch (err) {
          return { ok: false, reason: `SIGTERM failed: ${String(err)}` };
        }
        let dead = await waitForExit(s.pid, 3000);
        if (!dead) {
          try {
            process.kill(s.pid, 'SIGKILL');
          } catch {
            /* already gone */
          }
          dead = await waitForExit(s.pid, 1000);
        }
        if (!dead) {
          return { ok: false, reason: 'process still alive after SIGKILL' };
        }
        await writeSession(iii, cfg.stateScope, {
          ...s,
          status: 'interrupted',
          updatedAt: Date.now(),
        });
        return { ok: true, via: 'signal', pid: s.pid };
      }

      return { ok: false, reason: 'no tmuxTarget or pid on session' };
    },
    { description: 'Kill an agent session by tmux pane or pid' },
  );

  await iii.registerFunction(
    'iiiterm::session::reattach',
    async (input: ByIdPayload) => {
      const s = await resolveSession(iii, cfg.stateScope, input.id);
      if (!s) return { ok: false, reason: 'session not found' };
      if (!s.tmuxTarget) return { ok: false, reason: 'no tmuxTarget on session' };
      const r = await focusPane(s.tmuxTarget);
      return r.ok ? { ok: true, target: s.tmuxTarget } : { ok: false, reason: r.stderr.trim() };
    },
    { description: 'Focus the tmux pane for a session' },
  );

  await iii.registerFunction(
    'iiiterm::session::resend',
    async (input: ResendPayload) => {
      const s = await resolveSession(iii, cfg.stateScope, input.id);
      if (!s) return { ok: false, reason: 'session not found' };
      const raw = input.prompt ?? s.lastMessage;
      if (!raw) return { ok: false, reason: 'no prompt provided and no lastMessage' };
      if (!s.tmuxTarget) return { ok: false, reason: 'no tmuxTarget on session' };
      const text = sanitizePrompt(raw);
      if (!text) return { ok: false, reason: 'prompt is empty after sanitization' };
      const r = await sendKeys(s.tmuxTarget, text);
      return r.ok ? { ok: true, target: s.tmuxTarget, sent: text.slice(0, 80) } : { ok: false, reason: r.stderr.trim() };
    },
    { description: 'Send a single-line prompt to the tmux pane of an existing session' },
  );

  process.stdout.write(
    `[iiiterm] actions up · engine ${cfg.engineUrl} · scope ${cfg.stateScope}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] actions failed: ${String(err)}\n`);
  process.exit(1);
});

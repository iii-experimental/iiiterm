import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { getSession, writeSession } from '../state.js';
import { focusPane, killPane, sendKeys } from '../tmux.js';
import type { SessionState } from '../types.js';

interface ByIdPayload {
  id: string;
}

interface ResendPayload extends ByIdPayload {
  prompt?: string;
}

async function resolveSession(
  iii: Awaited<ReturnType<typeof registerWorker>>,
  scope: string,
  id: string,
): Promise<SessionState | null> {
  return getSession(iii, scope, id);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-actions',
  });

  await iii.registerFunction(
    'iiiterm::session::kill',
    async (input: ByIdPayload) => {
      const s = await resolveSession(iii, cfg.stateScope, input.id);
      if (!s) return { ok: false, reason: 'session not found' };

      if (s.tmuxTarget) {
        const r = await killPane(s.tmuxTarget);
        if (r.ok) {
          await writeSession(iii, cfg.stateScope, { ...s, status: 'interrupted', updatedAt: Date.now() });
          return { ok: true, via: 'tmux', target: s.tmuxTarget };
        }
        return { ok: false, reason: r.stderr.trim() || 'tmux kill-pane failed' };
      }

      if (s.pid) {
        try {
          process.kill(s.pid, 'SIGTERM');
          await writeSession(iii, cfg.stateScope, { ...s, status: 'interrupted', updatedAt: Date.now() });
          return { ok: true, via: 'signal', pid: s.pid };
        } catch (err) {
          return { ok: false, reason: String(err) };
        }
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
      const text = input.prompt ?? s.lastMessage;
      if (!text) return { ok: false, reason: 'no prompt provided and no lastMessage' };
      if (!s.tmuxTarget) return { ok: false, reason: 'no tmuxTarget on session' };
      const r = await sendKeys(s.tmuxTarget, text);
      return r.ok ? { ok: true, target: s.tmuxTarget, sent: text.slice(0, 80) } : { ok: false, reason: r.stderr.trim() };
    },
    { description: 'Send a prompt to the tmux pane of an existing session' },
  );

  console.log(`[iiiterm] actions up · engine ${cfg.engineUrl} · scope ${cfg.stateScope}`);
}

main().catch((err) => {
  console.error('[iiiterm] actions failed:', err);
  process.exit(1);
});

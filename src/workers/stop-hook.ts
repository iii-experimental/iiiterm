import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { expand } from '../paths.js';

const HANDOFF_PATH = expand(
  process.env.IIITERM_STOP_HOOK_HANDOFF ?? '~/.iiiterm/stop-hook-handoff.json',
);

interface Handoff {
  [sessionId: string]: {
    reason: string;
    acked?: number;
    issuedAt: number;
  };
}

interface HookInput {
  session_id?: string;
  sessionId?: string;
  cwd?: string;
  stop_reason?: string;
}

async function readHandoff(): Promise<Handoff> {
  if (!existsSync(HANDOFF_PATH)) return {};
  try {
    return JSON.parse(await readFile(HANDOFF_PATH, 'utf8')) as Handoff;
  } catch {
    return {};
  }
}

async function writeHandoff(h: Handoff): Promise<void> {
  await writeFile(HANDOFF_PATH, JSON.stringify(h, null, 2));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-stop-hook' });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::stop_hook::set',
    async (input: { session_id: string; reason: string }) => {
      if (!input?.session_id || !input?.reason) return { ok: false, reason: 'session_id + reason required' };
      const h = await readHandoff();
      h[input.session_id] = { reason: input.reason, issuedAt: Date.now() };
      await writeHandoff(h);
      return { ok: true };
    },
    { description: 'Queue a stop-hook reason for a specific session id.' },
  );

  await iii.registerFunction(
    'iiiterm::stop_hook::fetch',
    async (input: HookInput) => {
      const id = input?.session_id ?? input?.sessionId;
      if (!id) return { ok: false, reason: 'session_id required', stop: true };
      const h = await readHandoff();
      const entry = h[id];
      if (!entry || entry.acked) return { ok: true, stop: true };
      entry.acked = Date.now();
      h[id] = entry;
      await writeHandoff(h);
      return { ok: true, stop: false, reason: entry.reason };
    },
    {
      description:
        'Called by the Claude Code / Codex Stop hook. Returns { reason } to continue or stop: true to halt.',
    },
  );

  await iii.registerFunction(
    'iiiterm::stop_hook::clear',
    async (input: { session_id: string }) => {
      const h = await readHandoff();
      delete h[input.session_id];
      await writeHandoff(h);
      return { ok: true };
    },
    { description: 'Drop any queued reason for a session.' },
  );

  process.stdout.write(`[iiiterm] stop-hook up · handoff ${HANDOFF_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] stop-hook failed: ${String(err)}\n`);
  process.exit(1);
});

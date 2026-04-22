import { registerWorker, type ISdk } from 'iii-sdk';
import { cronEveryPoll, loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { listPanes, pickPaneForSession } from '../tmux.js';
import type { SessionState } from '../types.js';

async function attachPanes(iii: ISdk, scope: string): Promise<number> {
  const panes = await listPanes();
  if (panes.length === 0) return 0;

  const res = (await iii.trigger({
    function_id: 'state::list',
    payload: { scope },
  })) as { items?: Array<{ key: string; value: SessionState }> };

  let updated = 0;
  for (const { value: s } of res.items ?? []) {
    const pane = pickPaneForSession(panes, s.agent, s.cwd);
    if (!pane) continue;
    if (s.tmuxTarget === pane.target && s.pid === pane.pid) continue;
    const next: SessionState = {
      ...s,
      tmuxTarget: pane.target,
      pid: pane.pid,
      updatedAt: Date.now(),
    };
    await iii.trigger({
      function_id: 'state::set',
      payload: { scope, key: s.id, value: next },
    });
    updated += 1;
  }
  return updated;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-tmux',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::bridge::tmux::attach',
    async () => {
      const updated = await attachPanes(iii, cfg.stateScope);
      return { updated };
    },
    {
      description:
        'Match tmux panes to existing sessions by agent CLI + cwd and attach tmuxTarget + pid',
    },
  );

  await iii.registerTrigger({
    type: 'cron',
    function_id: 'iiiterm::bridge::tmux::attach',
    config: { expression: cronEveryPoll(cfg.pollMs) },
    metadata: {},
  });

  process.stdout.write(
    `[iiiterm] bridge-tmux up · scope ${cfg.stateScope} · poll ${cfg.pollMs}ms\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-tmux failed: ${String(err)}\n`);
  process.exit(1);
});

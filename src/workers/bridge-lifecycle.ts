import { registerWorker, type ISdk } from 'iii-sdk';
import { cronEveryPoll, loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { decidePrunable, loadThresholds } from '../lifecycle/prune.js';
import type { SessionState } from '../types.js';

async function prune(iii: ISdk, scope: string): Promise<number> {
  const res = (await iii.trigger({
    function_id: 'state::list',
    payload: { scope },
  })) as { items?: Array<{ key: string; value: SessionState }> };
  const sessions = (res.items ?? []).map((i) => i.value);
  const thresholds = loadThresholds(process.env);
  const drops = decidePrunable(sessions, Date.now(), thresholds);
  for (const { id } of drops) {
    await iii.trigger({
      function_id: 'state::delete',
      payload: { scope, key: id },
    });
  }
  return drops.length;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-lifecycle',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::bridge::lifecycle::prune',
    async () => {
      const dropped = await prune(iii, cfg.stateScope);
      return { dropped };
    },
    { description: 'Delete sessions whose last activity exceeds configured thresholds' },
  );

  await iii.registerTrigger({
    type: 'cron',
    function_id: 'iiiterm::bridge::lifecycle::prune',
    config: { expression: cronEveryPoll(Math.max(cfg.pollMs * 10, 10_000)) },
    metadata: {},
  });

  process.stdout.write(
    `[iiiterm] bridge-lifecycle up · scope ${cfg.stateScope}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-lifecycle failed: ${String(err)}\n`);
  process.exit(1);
});

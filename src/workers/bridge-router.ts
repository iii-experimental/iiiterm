import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { expand } from '../paths.js';
import type { SessionState } from '../types.js';
import { evaluateRules, loadFiredSet } from './router-core.js';

interface StateTriggerPayload {
  scope: string;
  key: string;
  value?: SessionState;
  event_type?: string;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const rulesPath = expand(
    process.env.IIITERM_ROUTER_RULES ?? '~/.config/iiiterm/router.json',
  );

  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-router',
  });
  attachSdkShutdown(iii);

  const fired = await loadFiredSet(iii);

  await iii.registerFunction(
    'iiiterm::router::evaluate',
    async (input: StateTriggerPayload | undefined) => {
      const target = input?.value;
      const fires = await evaluateRules(iii, fired, cfg.stateScope, rulesPath, target);
      return { fires };
    },
    { description: 'Evaluate router rules against a changed session (or all if none)' },
  );

  await iii.registerTrigger({
    type: 'state',
    function_id: 'iiiterm::router::evaluate',
    config: { scope: cfg.stateScope },
    metadata: {},
  });

  process.stdout.write(
    `[iiiterm] bridge-router up · rules ${rulesPath} · scope ${cfg.stateScope} · fired-keys ${fired.size} restored\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-router failed: ${String(err)}\n`);
  process.exit(1);
});

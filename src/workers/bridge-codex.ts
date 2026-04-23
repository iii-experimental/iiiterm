import { registerWorker } from 'iii-sdk';
import { cronEveryPoll, loadConfig } from '../config.js';
import { sdkReporter } from '../errors.js';
import { iiitermHost } from '../host.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { writeSession } from '../state.js';
import { scanCodexSessions } from '../watchers/codex.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-codex',
  });
  attachSdkShutdown(iii);
  const onError = sdkReporter(iii, 'iiiterm/bridge-codex');

  await iii.registerFunction(
    'iiiterm::bridge::codex::scan',
    async () => {
      const sessions = await scanCodexSessions(cfg.codexSessionsDir, { onError });
      const host = iiitermHost();
      for (const s of sessions) {
        await writeSession(iii, cfg.stateScope, { ...s, host });
      }
      return { scanned: sessions.length };
    },
    { description: 'Scan codex rollout files and push session state to engine' },
  );

  await iii.registerTrigger({
    type: 'cron',
    function_id: 'iiiterm::bridge::codex::scan',
    config: { expression: cronEveryPoll(cfg.pollMs) },
    metadata: {},
  });

  process.stdout.write(
    `[iiiterm] bridge-codex up · watching ${cfg.codexSessionsDir} · scope ${cfg.stateScope}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-codex failed: ${String(err)}\n`);
  process.exit(1);
});

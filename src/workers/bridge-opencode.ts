import { registerWorker } from 'iii-sdk';
import { cronEveryPoll, loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { writeSession } from '../state.js';
import { scanOpencodeDb } from '../watchers/opencode.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-opencode',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::bridge::opencode::scan',
    async () => {
      const query = process.env.IIITERM_OPENCODE_QUERY;
      const sessions = await scanOpencodeDb(cfg.opencodeDbPath, query);
      for (const s of sessions) {
        await writeSession(iii, cfg.stateScope, s);
      }
      return { scanned: sessions.length };
    },
    { description: 'Poll opencode SQLite and push session state to engine' },
  );

  await iii.registerTrigger({
    type: 'cron',
    function_id: 'iiiterm::bridge::opencode::scan',
    config: { expression: cronEveryPoll(cfg.pollMs) },
    metadata: {},
  });

  process.stdout.write(
    `[iiiterm] bridge-opencode up · watching ${cfg.opencodeDbPath} · scope ${cfg.stateScope}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-opencode failed: ${String(err)}\n`);
  process.exit(1);
});

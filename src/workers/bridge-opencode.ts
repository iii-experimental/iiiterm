import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { writeSession } from '../state.js';
import { scanOpencodeDb } from '../watchers/opencode.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-opencode',
  });

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
    config: { expression: `*/${Math.max(1, Math.round(cfg.pollMs / 1000))} * * * * *` },
    metadata: {},
  });

  console.log(
    `[iiiterm] bridge-opencode up · watching ${cfg.opencodeDbPath} · scope ${cfg.stateScope}`,
  );
}

main().catch((err) => {
  console.error('[iiiterm] bridge-opencode failed:', err);
  process.exit(1);
});

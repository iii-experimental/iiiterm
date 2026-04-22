import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { writeSession } from '../state.js';
import { scanCodexSessions } from '../watchers/codex.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-codex',
  });

  await iii.registerFunction(
    'iiiterm::bridge::codex::scan',
    async () => {
      const sessions = await scanCodexSessions(cfg.codexSessionsDir);
      for (const s of sessions) {
        await writeSession(iii, cfg.stateScope, s);
      }
      return { scanned: sessions.length };
    },
    { description: 'Scan codex rollout files and push session state to engine' },
  );

  await iii.registerTrigger({
    type: 'cron',
    function_id: 'iiiterm::bridge::codex::scan',
    config: { expression: `*/${Math.max(1, Math.round(cfg.pollMs / 1000))} * * * * *` },
    metadata: {},
  });

  console.log(
    `[iiiterm] bridge-codex up · watching ${cfg.codexSessionsDir} · scope ${cfg.stateScope}`,
  );
}

main().catch((err) => {
  console.error('[iiiterm] bridge-codex failed:', err);
  process.exit(1);
});

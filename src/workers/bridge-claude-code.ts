import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { writeSession } from '../state.js';
import { scanClaudeProjects } from '../watchers/claude-code.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-claude-code',
  });

  await iii.registerFunction(
    'iiiterm::bridge::claude-code::scan',
    async () => {
      const sessions = await scanClaudeProjects(cfg.claudeProjectsDir);
      for (const s of sessions) {
        await writeSession(iii, cfg.stateScope, s);
      }
      return { scanned: sessions.length };
    },
    { description: 'Scan ~/.claude/projects and push session state to engine' },
  );

  await iii.registerTrigger({
    type: 'cron',
    function_id: 'iiiterm::bridge::claude-code::scan',
    config: { expression: `*/${Math.max(1, Math.round(cfg.pollMs / 1000))} * * * * *` },
    metadata: {},
  });

  console.log(
    `[iiiterm] bridge-claude-code up · watching ${cfg.claudeProjectsDir} · scope ${cfg.stateScope}`,
  );
}

main().catch((err) => {
  console.error('[iiiterm] bridge-claude-code failed:', err);
  process.exit(1);
});

import { registerWorker } from 'iii-sdk';
import { cronEveryPoll, loadConfig } from '../config.js';
import { sdkReporter } from '../errors.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { writeSession } from '../state.js';
import { scanClaudeProjects } from '../watchers/claude-code.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-claude-code',
  });
  attachSdkShutdown(iii);
  const onError = sdkReporter(iii, 'iiiterm/bridge-claude-code');

  await iii.registerFunction(
    'iiiterm::bridge::claude-code::scan',
    async () => {
      const sessions = await scanClaudeProjects(cfg.claudeProjectsDir, { onError });
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
    config: { expression: cronEveryPoll(cfg.pollMs) },
    metadata: {},
  });

  process.stdout.write(
    `[iiiterm] bridge-claude-code up · watching ${cfg.claudeProjectsDir} · scope ${cfg.stateScope}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-claude-code failed: ${String(err)}\n`);
  process.exit(1);
});

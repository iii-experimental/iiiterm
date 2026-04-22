import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_CLAUDE_BIN ?? 'claude';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-claude-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::claude::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => ['-p', '--output-format', 'text', '--', i.prompt],
        },
        input,
      ),
    {
      description:
        'Run Claude Code headlessly for a single prompt and return the result. CLI must be on PATH as `claude` or set IIITERM_CLAUDE_BIN.',
    },
  );

  process.stdout.write(`[iiiterm] claude-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] claude-worker failed: ${String(err)}\n`);
  process.exit(1);
});

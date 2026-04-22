import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_CLAUDE_BIN ?? 'claude';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-claude-worker',
  });

  await iii.registerFunction(
    'agent::claude::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => ['-p', i.prompt, '--output-format', 'text'],
        },
        input,
      ),
    {
      description:
        'Run Claude Code headlessly for a single prompt and return the result. CLI must be on PATH as `claude` or set IIITERM_CLAUDE_BIN.',
    },
  );

  console.log(`[iiiterm] claude-worker up · bin ${BIN}`);
}

main().catch((err) => {
  console.error('[iiiterm] claude-worker failed:', err);
  process.exit(1);
});

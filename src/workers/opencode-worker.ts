import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_OPENCODE_BIN ?? 'opencode';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-opencode-worker',
  });

  await iii.registerFunction(
    'agent::opencode::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => ['run', i.prompt],
        },
        input,
      ),
    {
      description:
        'Run OpenCode CLI non-interactively for a single prompt. Binary resolved via PATH or IIITERM_OPENCODE_BIN.',
    },
  );

  console.log(`[iiiterm] opencode-worker up · bin ${BIN}`);
}

main().catch((err) => {
  console.error('[iiiterm] opencode-worker failed:', err);
  process.exit(1);
});

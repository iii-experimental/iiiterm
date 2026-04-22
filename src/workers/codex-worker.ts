import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_CODEX_BIN ?? 'codex';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-codex-worker',
  });

  await iii.registerFunction(
    'agent::codex::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => ['exec', i.prompt],
        },
        input,
      ),
    {
      description:
        'Run Codex CLI non-interactively for a single prompt. Binary resolved via PATH or IIITERM_CODEX_BIN.',
    },
  );

  console.log(`[iiiterm] codex-worker up · bin ${BIN}`);
}

main().catch((err) => {
  console.error('[iiiterm] codex-worker failed:', err);
  process.exit(1);
});

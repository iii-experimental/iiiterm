import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_AMP_BIN ?? 'amp';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-amp-worker',
  });

  await iii.registerFunction(
    'agent::amp::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => [i.prompt],
          usesStdin: true,
        },
        input,
      ),
    {
      description:
        'Run Amp CLI non-interactively for a single prompt. Binary resolved via PATH or IIITERM_AMP_BIN.',
    },
  );

  console.log(`[iiiterm] amp-worker up · bin ${BIN}`);
}

main().catch((err) => {
  console.error('[iiiterm] amp-worker failed:', err);
  process.exit(1);
});

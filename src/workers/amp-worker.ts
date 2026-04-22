import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_AMP_BIN ?? 'amp';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-amp-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::amp::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: () => [],
          usesStdin: true,
        },
        input,
      ),
    {
      description:
        'Run Amp CLI non-interactively for a single prompt. Binary resolved via PATH or IIITERM_AMP_BIN.',
    },
  );

  process.stdout.write(`[iiiterm] amp-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] amp-worker failed: ${String(err)}\n`);
  process.exit(1);
});

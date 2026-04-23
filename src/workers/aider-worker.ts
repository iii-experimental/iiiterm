import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';
import { makeStream, type OptionalStreamInput } from '../agents/stream.js';

const BIN = process.env.IIITERM_AIDER_BIN ?? 'aider';

type Input = AgentRunInput & OptionalStreamInput;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-aider-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::aider::run',
    async (input: Input) => {
      const { onChunk, close } = makeStream(input);
      try {
        return await runAgent(
          {
            bin: BIN,
            args: (i) => ['--yes-always', '--message', i.prompt],
          },
          { ...input, onChunk },
        );
      } finally {
        close();
      }
    },
    { description: 'Run Aider non-interactively. Binary resolved via PATH or IIITERM_AIDER_BIN.' },
  );

  process.stdout.write(`[iiiterm] aider-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] aider-worker failed: ${String(err)}\n`);
  process.exit(1);
});

import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';
import { makeStream, type OptionalStreamInput } from '../agents/stream.js';

const BIN = process.env.IIITERM_COPILOT_BIN ?? 'gh';

type Input = AgentRunInput & OptionalStreamInput;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-copilot-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::copilot::run',
    async (input: Input) => {
      const { onChunk, close } = makeStream(input);
      try {
        return await runAgent(
          {
            bin: BIN,
            args: (i) => ['copilot', 'suggest', '-t', 'shell', '--', i.prompt],
          },
          { ...input, onChunk },
        );
      } finally {
        close();
      }
    },
    {
      description:
        'Run GitHub Copilot via `gh copilot suggest`. Binary resolved via PATH or IIITERM_COPILOT_BIN.',
    },
  );

  process.stdout.write(`[iiiterm] copilot-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] copilot-worker failed: ${String(err)}\n`);
  process.exit(1);
});

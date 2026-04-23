import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';
import { makeStream, type OptionalStreamInput } from '../agents/stream.js';

const BIN = process.env.IIITERM_QWEN_BIN ?? 'qwen';

type Input = AgentRunInput & OptionalStreamInput;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-qwen-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::qwen::run',
    async (input: Input) => {
      const { onChunk, close } = makeStream(input);
      try {
        return await runAgent(
          {
            bin: BIN,
            args: (i) => ['--prompt', '--', i.prompt],
          },
          { ...input, onChunk },
        );
      } finally {
        close();
      }
    },
    { description: 'Run Qwen CLI non-interactively. Binary resolved via PATH or IIITERM_QWEN_BIN.' },
  );

  process.stdout.write(`[iiiterm] qwen-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] qwen-worker failed: ${String(err)}\n`);
  process.exit(1);
});

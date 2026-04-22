import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';
import { makeStream, type OptionalStreamInput } from '../agents/stream.js';

const BIN = process.env.IIITERM_CODEX_BIN ?? 'codex';

type Input = AgentRunInput & OptionalStreamInput;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-codex-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::codex::run',
    async (input: Input) => {
      const { onChunk, close } = makeStream(input);
      try {
        return await runAgent(
          {
            bin: BIN,
            args: (i) => ['exec', '--', i.prompt],
          },
          { ...input, onChunk },
        );
      } finally {
        close();
      }
    },
    {
      description:
        'Run Codex CLI. Pass { stream: { writerRef, engineWsBase } } to receive partial output.',
    },
  );

  process.stdout.write(`[iiiterm] codex-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] codex-worker failed: ${String(err)}\n`);
  process.exit(1);
});

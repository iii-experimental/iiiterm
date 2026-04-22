import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_OPENCODE_BIN ?? 'opencode';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-opencode-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::opencode::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => ['run', '--', i.prompt],
        },
        input,
      ),
    {
      description:
        'Run OpenCode CLI non-interactively for a single prompt. Binary resolved via PATH or IIITERM_OPENCODE_BIN.',
    },
  );

  process.stdout.write(`[iiiterm] opencode-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] opencode-worker failed: ${String(err)}\n`);
  process.exit(1);
});

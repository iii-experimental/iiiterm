import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';

const BIN = process.env.IIITERM_CODEX_BIN ?? 'codex';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-codex-worker',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'agent::codex::run',
    async (input: AgentRunInput) =>
      runAgent(
        {
          bin: BIN,
          args: (i) => ['exec', '--', i.prompt],
        },
        input,
      ),
    {
      description:
        'Run Codex CLI non-interactively for a single prompt. Binary resolved via PATH or IIITERM_CODEX_BIN.',
    },
  );

  process.stdout.write(`[iiiterm] codex-worker up · bin ${BIN}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] codex-worker failed: ${String(err)}\n`);
  process.exit(1);
});

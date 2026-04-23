import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { runAgent, type AgentRunInput } from '../agents/run.js';
import { makeStream, type OptionalStreamInput } from '../agents/stream.js';

/**
 * Generic wrapper for any CLI agent that isn't first-class yet.  Pick a name
 * and a binary via env, point router rules at `agent::<name>::run` and ship.
 *
 *   IIITERM_AGENT_NAME    required (e.g. "openclaw", "hermes", "mybot")
 *   IIITERM_AGENT_BIN     required (e.g. "/usr/local/bin/openclaw")
 *   IIITERM_AGENT_ARGS    optional space-separated argv template; {{prompt}} substituted
 *                         default: "-- {{prompt}}"
 *   IIITERM_AGENT_STDIN   "1" to pipe the prompt via stdin instead
 */

type Input = AgentRunInput & OptionalStreamInput;

function templateArgs(tpl: string, prompt: string): string[] {
  return tpl
    .split(/\s+/)
    .filter(Boolean)
    .map((a) => a.replace(/\{\{\s*prompt\s*\}\}/g, prompt));
}

async function main(): Promise<void> {
  const name = process.env.IIITERM_AGENT_NAME;
  const bin = process.env.IIITERM_AGENT_BIN;
  if (!name || !bin) {
    process.stderr.write('[iiiterm] generic-agent-worker needs IIITERM_AGENT_NAME + IIITERM_AGENT_BIN\n');
    process.exit(2);
    return;
  }
  const tpl = process.env.IIITERM_AGENT_ARGS ?? '-- {{prompt}}';
  const usesStdin = process.env.IIITERM_AGENT_STDIN === '1';

  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: `iiiterm-agent-${name}`,
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    `agent::${name}::run`,
    async (input: Input) => {
      const { onChunk, close } = makeStream(input);
      try {
        return await runAgent(
          {
            bin,
            args: (i) => (usesStdin ? [] : templateArgs(tpl, i.prompt)),
            usesStdin,
          },
          { ...input, onChunk },
        );
      } finally {
        close();
      }
    },
    {
      description: `Run ${name} CLI at ${bin}. Argv tpl: "${tpl}". stdin=${usesStdin}.`,
    },
  );

  process.stdout.write(`[iiiterm] generic-agent-worker(${name}) up · bin ${bin}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] generic-agent-worker failed: ${String(err)}\n`);
  process.exit(1);
});

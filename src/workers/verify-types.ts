import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { outcome, runShell, type VerifierInput } from '../verifiers/run.js';

const DEFAULT_CMD = process.env.IIITERM_TYPES_CMD ?? 'npx tsc --noEmit';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-verify-types' });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'verify::types_ok',
    async (input: VerifierInput) =>
      outcome(await runShell(input.command ?? DEFAULT_CMD, { timeoutMs: 5 * 60_000, ...input })),
    { description: 'Run the configured type-check command. Defaults to `npx tsc --noEmit` or IIITERM_TYPES_CMD.' },
  );

  process.stdout.write(`[iiiterm] verify-types up · default "${DEFAULT_CMD}"\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] verify-types failed: ${String(err)}\n`);
  process.exit(1);
});

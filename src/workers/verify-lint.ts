import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { outcome, runShell, type VerifierInput } from '../verifiers/run.js';

const DEFAULT_CMD = process.env.IIITERM_LINT_CMD ?? 'npm run lint --silent';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-verify-lint' });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'verify::lint_clean',
    async (input: VerifierInput) =>
      outcome(await runShell(input.command ?? DEFAULT_CMD, { timeoutMs: 5 * 60_000, ...input })),
    { description: 'Run the configured lint command. Defaults to `npm run lint --silent` or IIITERM_LINT_CMD.' },
  );

  process.stdout.write(`[iiiterm] verify-lint up · default "${DEFAULT_CMD}"\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] verify-lint failed: ${String(err)}\n`);
  process.exit(1);
});

import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { outcome, runShell, type VerifierInput } from '../verifiers/run.js';

const DEFAULT_CMD = process.env.IIITERM_TEST_CMD ?? 'npm test --silent';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-verify-tests' });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'verify::tests_passed',
    async (input: VerifierInput) =>
      outcome(await runShell(input.command ?? DEFAULT_CMD, { timeoutMs: 10 * 60_000, ...input })),
    {
      description:
        'Run the configured test command in the target cwd and return { pass } for use as a router verify gate. Defaults to `npm test --silent` or IIITERM_TEST_CMD.',
    },
  );

  process.stdout.write(`[iiiterm] verify-tests up · default "${DEFAULT_CMD}"\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] verify-tests failed: ${String(err)}\n`);
  process.exit(1);
});

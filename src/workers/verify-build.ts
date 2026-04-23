import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { outcome, runShell, type VerifierInput } from '../verifiers/run.js';

const DEFAULT_CMD = process.env.IIITERM_BUILD_CMD ?? 'npm run build --silent';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-verify-build' });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'verify::build_ok',
    async (input: VerifierInput) =>
      outcome(await runShell(input.command ?? DEFAULT_CMD, { timeoutMs: 15 * 60_000, ...input })),
    { description: 'Run the configured build command. Defaults to `npm run build --silent` or IIITERM_BUILD_CMD.' },
  );

  process.stdout.write(`[iiiterm] verify-build up · default "${DEFAULT_CMD}"\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] verify-build failed: ${String(err)}\n`);
  process.exit(1);
});

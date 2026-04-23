import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { git } from '../git.js';
import { attachSdkShutdown } from '../lifecycle.js';

interface Input {
  cwd: string;
}

async function check(input: Input): Promise<{ pass: boolean; reason?: string; ts: number }> {
  const ts = Date.now();
  const porcelain = await git(input.cwd, ['status', '--porcelain']);
  if (!porcelain.ok) return { pass: false, reason: porcelain.stderr.trim(), ts };

  if (porcelain.stdout.trim().length > 0) {
    const dirtyCount = porcelain.stdout.trim().split('\n').length;
    return { pass: false, reason: `${dirtyCount} dirty entries`, ts };
  }

  const unmerged = await git(input.cwd, ['ls-files', '-u']);
  if (unmerged.ok && unmerged.stdout.trim().length > 0) {
    return { pass: false, reason: 'unmerged paths present', ts };
  }

  return { pass: true, ts };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-verify-diff-clean' });
  attachSdkShutdown(iii);

  await iii.registerFunction('verify::diff_clean', check, {
    description: 'Pass only when the target cwd has no dirty entries and no unmerged paths.',
  });

  process.stdout.write('[iiiterm] verify-diff-clean up\n');
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] verify-diff-clean failed: ${String(err)}\n`);
  process.exit(1);
});

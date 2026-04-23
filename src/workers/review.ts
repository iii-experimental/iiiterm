import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { diffSummary, git } from '../git.js';
import { attachSdkShutdown } from '../lifecycle.js';

interface DiffInput {
  worktree: string;
  baseRef?: string;
}

interface MergeInput {
  repo: string;
  worktree: string;
  targetBranch: string;
  strategy?: 'merge' | 'squash' | 'rebase';
  message?: string;
}

interface DiscardInput {
  repo: string;
  worktree: string;
  deleteBranch?: boolean;
  force?: boolean;
}

async function resolveBase(
  worktree: string,
  baseRef: string | undefined,
): Promise<string> {
  if (baseRef) return baseRef;
  const candidates = ['main', 'master', 'trunk', 'develop'];
  for (const c of candidates) {
    const r = await git(worktree, ['rev-parse', '--verify', c]);
    if (r.ok) return c;
  }
  const head = await git(worktree, ['rev-parse', 'HEAD~1']);
  return head.ok ? head.stdout.trim() : 'HEAD';
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-review',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    'iiiterm::review::diff',
    async (input: DiffInput) => {
      const baseRef = await resolveBase(input.worktree, input.baseRef);
      const summary = await diffSummary(input.worktree, baseRef);
      return { ok: true, baseRef, ...summary };
    },
    { description: 'Summarize the diff between a worktree HEAD and its base.' },
  );

  await iii.registerFunction(
    'iiiterm::review::merge',
    async (input: MergeInput) => {
      const strategy = input.strategy ?? 'merge';
      const co = await git(input.repo, ['checkout', input.targetBranch]);
      if (!co.ok) return { ok: false, reason: co.stderr.trim() };

      const srcBranch = await git(input.worktree, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (!srcBranch.ok) return { ok: false, reason: srcBranch.stderr.trim() };
      const src = srcBranch.stdout.trim();

      if (strategy === 'rebase') {
        const r = await git(input.repo, ['rebase', src]);
        return r.ok ? { ok: true, strategy, src, target: input.targetBranch } : { ok: false, reason: r.stderr.trim() };
      }

      const args = ['merge', '--no-ff'];
      if (strategy === 'squash') args.push('--squash');
      if (input.message) args.push('-m', input.message);
      args.push(src);
      const r = await git(input.repo, args);
      return r.ok ? { ok: true, strategy, src, target: input.targetBranch } : { ok: false, reason: r.stderr.trim() };
    },
    { description: 'Merge a worktree branch into the target branch in the main repo. strategies: merge|squash|rebase.' },
  );

  await iii.registerFunction(
    'iiiterm::review::discard',
    async (input: DiscardInput) => {
      const remove = ['worktree', 'remove'];
      if (input.force) remove.push('--force');
      remove.push(input.worktree);
      const r = await git(input.repo, remove);
      if (!r.ok) return { ok: false, reason: r.stderr.trim() };

      if (input.deleteBranch) {
        const branchR = await git(input.worktree, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => null);
        if (branchR?.ok) {
          await git(input.repo, ['branch', input.force ? '-D' : '-d', branchR.stdout.trim()]);
        }
      }
      return { ok: true };
    },
    { description: 'Discard a worktree and optionally delete its branch.' },
  );

  process.stdout.write(`[iiiterm] review up · engine ${cfg.engineUrl}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] review failed: ${String(err)}\n`);
  process.exit(1);
});

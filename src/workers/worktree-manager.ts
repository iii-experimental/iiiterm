import { registerWorker } from 'iii-sdk';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { git, listWorktrees } from '../git.js';
import { attachSdkShutdown } from '../lifecycle.js';

interface CreateInput {
  repo: string;
  branch: string;
  baseRef?: string;
  name?: string;
  rootDir?: string;
}

interface RemoveInput {
  repo: string;
  path: string;
  force?: boolean;
  deleteBranch?: boolean;
}

interface ListInput {
  repo: string;
}

function defaultRoot(): string {
  return resolve(homedir(), '.iiiterm', 'worktrees');
}

async function createWorktree(input: CreateInput) {
  const root = resolve(input.rootDir ?? defaultRoot());
  const name = input.name ?? input.branch.replace(/[^a-zA-Z0-9_-]/g, '-');
  const path = join(root, `${name}`);
  await mkdir(dirname(path), { recursive: true });

  const args = ['worktree', 'add', '-b', input.branch, path];
  if (input.baseRef) args.push(input.baseRef);
  const r = await git(input.repo, args);
  if (!r.ok) return { ok: false, reason: r.stderr.trim(), path: null };
  return { ok: true, path, branch: input.branch };
}

async function removeWorktree(input: RemoveInput) {
  const args = ['worktree', 'remove'];
  if (input.force) args.push('--force');
  args.push(input.path);
  const r = await git(input.repo, args);
  if (!r.ok) return { ok: false, reason: r.stderr.trim() };
  if (input.deleteBranch) {
    const wts = await listWorktrees(input.repo);
    const removed = wts.find((w) => w.path === input.path);
    if (removed?.branch) {
      const delArgs = ['branch', input.force ? '-D' : '-d', removed.branch];
      await git(input.repo, delArgs);
    }
  }
  return { ok: true };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-worktree-manager',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction('iiiterm::worktree::create', createWorktree, {
    description:
      'Create a git worktree on a new branch. Defaults root to ~/.iiiterm/worktrees.',
  });
  await iii.registerFunction('iiiterm::worktree::remove', removeWorktree, {
    description: 'Remove a git worktree. --force to allow dirty, --deleteBranch to drop branch.',
  });
  await iii.registerFunction(
    'iiiterm::worktree::list',
    async (input: ListInput) => ({ worktrees: await listWorktrees(input.repo) }),
    { description: 'List all worktrees attached to a repo.' },
  );

  process.stdout.write(`[iiiterm] worktree-manager up · engine ${cfg.engineUrl}\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] worktree-manager failed: ${String(err)}\n`);
  process.exit(1);
});

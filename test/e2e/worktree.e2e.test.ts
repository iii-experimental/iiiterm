import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffSummary, git, listWorktrees } from '../../src/git.js';

let repoDir: string;

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-git-'));
  await git(repoDir, ['init', '-b', 'main']);
  await git(repoDir, ['config', 'user.email', 'test@iiiterm.dev']);
  await git(repoDir, ['config', 'user.name', 'iiiterm-test']);
  await writeFile(join(repoDir, 'a.txt'), 'hello\n');
  await git(repoDir, ['add', 'a.txt']);
  await git(repoDir, ['commit', '-m', 'init']);
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe('E2E git helpers', () => {
  it('creates a worktree on a new branch and lists it', async () => {
    const wtRoot = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-wt-'));
    const wtPath = join(wtRoot, 'feat');
    try {
      const create = await git(repoDir, ['worktree', 'add', '-b', 'feat/x', wtPath, 'main']);
      expect(create.ok).toBe(true);

      const canonical = await realpath(wtPath);
      const wts = await listWorktrees(repoDir);
      expect(wts.some((w) => w.path === canonical && w.branch === 'feat/x')).toBe(true);
    } finally {
      await rm(wtRoot, { recursive: true, force: true });
    }
  });

  it('summarises additions and deletions between a branch and base', async () => {
    const wtRoot = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-wt-'));
    const wtPath = join(wtRoot, 'feat');
    try {
      await git(repoDir, ['worktree', 'add', '-b', 'feat/y', wtPath, 'main']);
      await writeFile(join(wtPath, 'b.txt'), 'hello\nworld\n');
      await writeFile(join(wtPath, 'a.txt'), 'goodbye\n');
      await git(wtPath, ['add', '.']);
      await git(wtPath, ['commit', '-m', 'change']);

      const summary = await diffSummary(wtPath, 'main');
      const paths = summary.files.map((f) => f.path).sort();
      expect(paths).toEqual(['a.txt', 'b.txt']);
      expect(summary.additions).toBeGreaterThan(0);
      expect(summary.deletions).toBeGreaterThan(0);
      const statuses = Object.fromEntries(summary.files.map((f) => [f.path, f.status]));
      expect(statuses['b.txt']).toBe('A');
      expect(statuses['a.txt']).toBe('M');
    } finally {
      await rm(wtRoot, { recursive: true, force: true });
    }
  });
});

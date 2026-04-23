import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from '../../src/git.js';

/* Mirror the verify-diff-clean worker's pure logic, call it against real git. */
async function check(cwd: string): Promise<{ pass: boolean; reason?: string }> {
  const porcelain = await git(cwd, ['status', '--porcelain']);
  if (!porcelain.ok) return { pass: false, reason: porcelain.stderr.trim() };
  if (porcelain.stdout.trim().length > 0) {
    return { pass: false, reason: 'dirty entries present' };
  }
  const unmerged = await git(cwd, ['ls-files', '-u']);
  if (unmerged.ok && unmerged.stdout.trim().length > 0) {
    return { pass: false, reason: 'unmerged paths present' };
  }
  return { pass: true };
}

let repoDir: string;

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-verify-'));
  await git(repoDir, ['init', '-b', 'main']);
  await git(repoDir, ['config', 'user.email', 't@i.dev']);
  await git(repoDir, ['config', 'user.name', 't']);
  await writeFile(join(repoDir, 'a.txt'), 'hi\n');
  await git(repoDir, ['add', '.']);
  await git(repoDir, ['commit', '-m', 'init']);
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe('E2E verify::diff_clean', () => {
  it('passes on a clean working tree', async () => {
    const r = await check(repoDir);
    expect(r.pass).toBe(true);
  });

  it('fails when there are dirty entries', async () => {
    await writeFile(join(repoDir, 'a.txt'), 'changed\n');
    const r = await check(repoDir);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('dirty');
  });

  it('fails on an untracked file', async () => {
    await writeFile(join(repoDir, 'new.txt'), 'yo\n');
    const r = await check(repoDir);
    expect(r.pass).toBe(false);
  });
});

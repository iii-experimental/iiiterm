import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { runTeam, type TeamConfig } from '../../src/harness.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-harness-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E runTeam harness', () => {
  it('creates a worktree then spawns a pane for every member', async () => {
    const team: TeamConfig = {
      name: 'review',
      layout: 'split-horizontal',
      worktree: { enabled: true, repo: '/tmp/repo', baseRef: 'main' },
      members: [
        { role: 'plan', agent: 'claude-code' },
        { role: 'code', agent: 'codex', depends_on: 'plan' },
      ],
    };

    const worktreeCalls: Array<{ role: string; path: string }> = [];
    const spawnCalls: Array<{ role: string; tmuxTarget: string }> = [];

    let worktreeIdx = 0;
    let spawnIdx = 0;
    const sdk = stubSdk({
      onTrigger: (req) => {
        const payload = req.payload as { role?: string; name?: string };
        if (req.function_id === 'iiiterm::worktree::create') {
          const role = payload.name?.split('-').pop() ?? `w${worktreeIdx}`;
          const path = `/tmp/worktrees/${role}`;
          worktreeCalls.push({ role, path });
          worktreeIdx += 1;
          return { ok: true, path, branch: `iiiterm/review/${role}` };
        }
        if (req.function_id === 'iiiterm::spawn::agent') {
          const target = `main:0.${spawnIdx + 1}`;
          spawnIdx += 1;
          const role = payload.role ?? `r${spawnIdx}`;
          spawnCalls.push({ role, tmuxTarget: target });
          return { ok: true, id: `spawn-${spawnIdx}`, tmuxTarget: target };
        }
        return undefined;
      },
    });

    const outcomes = await runTeam(sdk, {
      team,
      prompt: 'refactor billing',
      cwd: '/tmp/repo',
      repo: '/tmp/repo',
    });

    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(worktreeCalls.map((w) => w.role).sort()).toEqual(['code', 'plan']);
    expect(spawnCalls.map((s) => s.role)).toEqual(['plan', 'code']);
    expect(outcomes[0]?.worktreePath).toMatch(/worktrees/);
    expect(outcomes[0]?.tmuxTarget).toBe('main:0.1');
    expect(outcomes[1]?.tmuxTarget).toBe('main:0.2');
  });

  it('skips worktree creation when the team opts out', async () => {
    const team: TeamConfig = {
      name: 'no-worktree',
      members: [{ role: 'only', agent: 'claude-code' }],
      worktree: { enabled: false },
    };

    let worktreeCalled = false;
    let spawnCalled = false;
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'iiiterm::worktree::create') {
          worktreeCalled = true;
          return { ok: true, path: '/tmp/unused' };
        }
        if (req.function_id === 'iiiterm::spawn::agent') {
          spawnCalled = true;
          return { ok: true, id: 's-1', tmuxTarget: 'main:0.1' };
        }
        return undefined;
      },
    });

    const outcomes = await runTeam(sdk, {
      team,
      prompt: 'hello',
      cwd: '/tmp',
    });

    expect(worktreeCalled).toBe(false);
    expect(spawnCalled).toBe(true);
    expect(outcomes[0]?.worktreePath).toBeUndefined();
  });

  it('stops at a failed worktree and records reason without spawning', async () => {
    const team: TeamConfig = {
      name: 'failcase',
      worktree: { enabled: true, repo: '/tmp/repo' },
      members: [{ role: 'plan', agent: 'claude-code' }],
    };
    let spawnCalled = false;
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'iiiterm::worktree::create') {
          return { ok: false, reason: 'fatal: not a git repository' };
        }
        if (req.function_id === 'iiiterm::spawn::agent') {
          spawnCalled = true;
          return { ok: true };
        }
        return undefined;
      },
    });
    const [outcome] = await runTeam(sdk, {
      team,
      prompt: 'p',
      cwd: '/tmp/repo',
      repo: '/tmp/repo',
    });
    expect(outcome?.ok).toBe(false);
    expect(outcome?.reason).toMatch(/worktree create failed/);
    expect(spawnCalled).toBe(false);
  });

  it('substitutes {{ prompt }} and {{ role }} in per-member prompts', async () => {
    const team: TeamConfig = {
      name: 'tpl',
      worktree: { enabled: false },
      members: [
        {
          role: 'review',
          agent: 'opencode',
          prompt: 'As {{ role }} review: {{ prompt }}',
        },
      ],
    };
    let captured: string | undefined;
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'iiiterm::spawn::agent') {
          captured = (req.payload as { prompt: string }).prompt;
          return { ok: true, id: 's', tmuxTarget: 'x:0.0' };
        }
        return undefined;
      },
    });
    await runTeam(sdk, { team, prompt: 'the diff', cwd: '/tmp' });
    expect(captured).toBe('As review review: the diff');
  });
});

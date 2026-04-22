import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fireKey,
  loadRules,
  matches,
  stableRuleKey,
  type RouterRule,
} from '../src/router.js';
import type { SessionState } from '../src/types.js';

const baseSession: SessionState = {
  id: 'sess-1',
  agent: 'claude-code',
  title: 'refactor billing',
  cwd: '/users/dev/app',
  status: 'done',
  updatedAt: 1,
};

describe('matches', () => {
  it('matches when all fields align', () => {
    expect(
      matches(baseSession, { agent: 'claude-code', status: 'done' }),
    ).toBe(true);
  });

  it('rejects agent mismatch', () => {
    expect(matches(baseSession, { agent: 'codex' })).toBe(false);
  });

  it('rejects status mismatch', () => {
    expect(matches(baseSession, { status: 'error' })).toBe(false);
  });

  it('matches cwdIncludes as substring', () => {
    expect(matches(baseSession, { cwdIncludes: '/app' })).toBe(true);
    expect(matches(baseSession, { cwdIncludes: '/nope' })).toBe(false);
  });

  it('matches titleIncludes as substring', () => {
    expect(matches(baseSession, { titleIncludes: 'billing' })).toBe(true);
    expect(matches(baseSession, { titleIncludes: 'auth' })).toBe(false);
  });

  it('treats an empty match as match-all', () => {
    expect(matches(baseSession, {})).toBe(true);
  });
});

describe('fireKey', () => {
  it('combines rule, session, and status', () => {
    expect(fireKey('rule-a', 'sess-1', 'done')).toBe('rule-a::sess-1::done');
  });
});

describe('stableRuleKey', () => {
  const rule: RouterRule = { when: {}, then: { function_id: 'x::y' } };
  it('uses an id when present', () => {
    expect(stableRuleKey({ ...rule, id: 'named' }, 0)).toBe('named');
  });
  it('falls back to rule-<index>', () => {
    expect(stableRuleKey(rule, 3)).toBe('rule-3');
  });
});

describe('loadRules', () => {
  it('returns an empty config when the file is missing', async () => {
    const cfg = await loadRules('/definitely/not/there.json');
    expect(cfg.rules).toEqual([]);
  });

  it('returns an empty config when the JSON is malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-router-'));
    try {
      const p = join(dir, 'broken.json');
      await writeFile(p, '{not json');
      const cfg = await loadRules(p);
      expect(cfg.rules).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty config when rules is not an array', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-router-'));
    try {
      const p = join(dir, 'wrong.json');
      await writeFile(p, JSON.stringify({ rules: 'nope' }));
      expect((await loadRules(p)).rules).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parses valid rules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-router-'));
    try {
      const p = join(dir, 'ok.json');
      await writeFile(
        p,
        JSON.stringify({
          rules: [
            {
              id: 'r1',
              when: { agent: 'claude-code', status: 'done' },
              then: { function_id: 'agent::codex::run' },
            },
          ],
        }),
      );
      const cfg = await loadRules(p);
      expect(cfg.rules).toHaveLength(1);
      expect(cfg.rules[0]?.id).toBe('r1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

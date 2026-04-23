import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTeam } from '../src/harness.js';

describe('loadTeam', () => {
  it('parses a valid team config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-team-'));
    try {
      const path = join(dir, 't.json');
      await writeFile(
        path,
        JSON.stringify({
          name: 'review',
          layout: 'split-horizontal',
          members: [
            { role: 'plan', agent: 'claude-code' },
            { role: 'code', agent: 'codex', depends_on: 'plan' },
          ],
        }),
      );
      const t = await loadTeam(path);
      expect(t.name).toBe('review');
      expect(t.members).toHaveLength(2);
      expect(t.members[1]?.depends_on).toBe('plan');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects configs without name or members', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-team-'));
    try {
      const path = join(dir, 'bad.json');
      await writeFile(path, JSON.stringify({ members: [] }));
      await expect(loadTeam(path)).rejects.toThrow(/missing name or members/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { evaluateRules, loadFiredSet } from '../../src/workers/router-core.js';
import type { SessionState } from '../../src/types.js';

const SCOPE = 'iiiterm:sessions';

let tmpDir: string;
let rulesPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-verify-'));
  rulesPath = join(tmpDir, 'router.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const target: SessionState = {
  id: 'sess-1',
  agent: 'claude-code',
  status: 'done',
  updatedAt: 1,
};

describe('E2E router verify gate', () => {
  it('does not fire `then` when verify returns { pass: false }', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'gated',
            when: { agent: 'claude-code', status: 'done' },
            verify: { function_id: 'verify::tests_passed', payload: {} },
            then: { function_id: 'agent::codex::run', payload: {} },
          },
        ],
      }),
    );

    const fires: string[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'verify::tests_passed') return { pass: false, reason: 'red tests' };
        if (req.function_id === 'agent::codex::run') {
          fires.push(req.function_id);
          return { ok: true };
        }
        return undefined;
      },
    });

    const fired = await loadFiredSet(sdk);
    const n = await evaluateRules(sdk, fired, SCOPE, rulesPath, target);
    expect(n).toBe(0);
    expect(fires).toHaveLength(0);
  });

  it('fires `then` when verify returns { pass: true }', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'gated',
            when: { agent: 'claude-code', status: 'done' },
            verify: { function_id: 'verify::tests_passed', payload: {} },
            then: { function_id: 'agent::codex::run', payload: {} },
          },
        ],
      }),
    );
    const fires: string[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'verify::tests_passed') return { pass: true };
        if (req.function_id === 'agent::codex::run') {
          fires.push(req.function_id);
          return { ok: true };
        }
        return undefined;
      },
    });
    const fired = await loadFiredSet(sdk);
    const n = await evaluateRules(sdk, fired, SCOPE, rulesPath, target);
    expect(n).toBe(1);
    expect(fires).toHaveLength(1);
  });

  it('treats a verify throw as blocked and records the fired key (no retry loop)', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'gated',
            when: { agent: 'claude-code', status: 'done' },
            verify: { function_id: 'verify::tests_passed', payload: {} },
            then: { function_id: 'agent::codex::run', payload: {} },
          },
        ],
      }),
    );
    const fires: string[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'verify::tests_passed') {
          throw new Error('verifier exploded');
        }
        if (req.function_id === 'agent::codex::run') {
          fires.push(req.function_id);
          return { ok: true };
        }
        return undefined;
      },
    });
    const fired = await loadFiredSet(sdk);
    const first = await evaluateRules(sdk, fired, SCOPE, rulesPath, target);
    const second = await evaluateRules(sdk, fired, SCOPE, rulesPath, target);
    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(fires).toHaveLength(0);
    expect(fired.size).toBe(1);
  });
});

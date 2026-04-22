import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { evaluateRules, loadFiredSet } from '../../src/workers/router-core.js';
import type { SessionState } from '../../src/types.js';

const SCOPE_SESSIONS = 'iiiterm:sessions';

let tmpDir: string;
let rulesPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-router-'));
  rulesPath = join(tmpDir, 'router.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E router', () => {
  it('fires a matching rule on a state::updated event carrying the target session', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'cc-done-codex',
            when: { agent: 'claude-code', status: 'done' },
            then: {
              function_id: 'agent::codex::run',
              payload: { prompt: 'review the diff' },
            },
          },
        ],
      }),
    );

    const calls: Array<{ function_id: string; payload: unknown }> = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'agent::codex::run') {
          calls.push({ function_id: req.function_id, payload: req.payload });
          return { ok: true };
        }
        return undefined;
      },
    });

    const target: SessionState = {
      id: 'sess-1',
      agent: 'claude-code',
      status: 'done',
      updatedAt: 1,
    };

    const fired = await loadFiredSet(sdk);
    const n = await evaluateRules(sdk, fired, SCOPE_SESSIONS, rulesPath, target);
    expect(n).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.function_id).toBe('agent::codex::run');
  });

  it('dedupes a repeated evaluation for the same rule+session+status', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'cc-done-codex',
            when: { agent: 'claude-code', status: 'done' },
            then: { function_id: 'agent::codex::run', payload: {} },
          },
        ],
      }),
    );
    const calls: string[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'agent::codex::run') {
          calls.push(req.function_id);
          return { ok: true };
        }
        return undefined;
      },
    });

    const target: SessionState = {
      id: 's',
      agent: 'claude-code',
      status: 'done',
      updatedAt: 1,
    };
    const fired = await loadFiredSet(sdk);
    await evaluateRules(sdk, fired, SCOPE_SESSIONS, rulesPath, target);
    await evaluateRules(sdk, fired, SCOPE_SESSIONS, rulesPath, target);
    expect(calls).toHaveLength(1);
  });

  it('skips rules whose when clause does not match', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'only-errors',
            when: { status: 'error' },
            then: { function_id: 'notify::op', payload: {} },
          },
        ],
      }),
    );
    const calls: string[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'notify::op') {
          calls.push(req.function_id);
          return { ok: true };
        }
        return undefined;
      },
    });

    const target: SessionState = {
      id: 's',
      agent: 'claude-code',
      status: 'done',
      updatedAt: 1,
    };
    const fired = await loadFiredSet(sdk);
    await evaluateRules(sdk, fired, SCOPE_SESSIONS, rulesPath, target);
    expect(calls).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import {
  evaluateRules,
  loadCapture,
  loadFiredSet,
} from '../../src/workers/router-core.js';
import type { SessionState } from '../../src/types.js';

const SCOPE = 'iiiterm:sessions';

let tmpDir: string;
let rulesPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-cap-'));
  rulesPath = join(tmpDir, 'router.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E router captures + requires', () => {
  it('first rule captures, second rule receives via requires', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'capture-plan',
            when: { agent: 'claude-code', status: 'done' },
            then: { function_id: 'fn::produce_plan', payload: {} },
            capture: { as: 'plan' },
          },
          {
            id: 'consume-plan',
            when: { agent: 'codex', status: 'waiting' },
            requires: [{ name: 'plan' }],
            then: { function_id: 'fn::use_plan', payload: {} },
          },
        ],
      }),
    );

    const uses: unknown[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'fn::produce_plan') return { step: 1, text: 'plan-body' };
        if (req.function_id === 'fn::use_plan') {
          uses.push(req.payload);
          return { ok: true };
        }
        return undefined;
      },
    });

    const target1: SessionState = {
      id: 'sess-1',
      agent: 'claude-code',
      status: 'done',
      updatedAt: 1,
    };
    const fired = await loadFiredSet(sdk);
    await evaluateRules(sdk, fired, SCOPE, rulesPath, target1);
    expect(await loadCapture(sdk, 'plan', 'sess-1')).toEqual({ step: 1, text: 'plan-body' });

    const target2: SessionState = {
      id: 'sess-1',
      agent: 'codex',
      status: 'waiting',
      updatedAt: 2,
    };
    await evaluateRules(sdk, fired, SCOPE, rulesPath, target2);
    expect(uses).toHaveLength(1);
    expect((uses[0] as { captures: unknown }).captures).toEqual({ plan: { step: 1, text: 'plan-body' } });
  });

  it('skips a rule whose required capture is missing', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'consume-plan',
            when: { status: 'waiting' },
            requires: [{ name: 'missing-plan' }],
            then: { function_id: 'fn::use_plan', payload: {} },
          },
        ],
      }),
    );
    const uses: unknown[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'fn::use_plan') {
          uses.push(req.payload);
          return { ok: true };
        }
        return undefined;
      },
    });
    const fired = await loadFiredSet(sdk);
    const target: SessionState = { id: 's', agent: 'codex', status: 'waiting', updatedAt: 1 };
    const n = await evaluateRules(sdk, fired, SCOPE, rulesPath, target);
    expect(n).toBe(0);
    expect(uses).toHaveLength(0);
  });

  it('serializes concurrent evaluateRules for the same session', async () => {
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'a',
            when: { status: 'done' },
            then: { function_id: 'fn::slow', payload: { tag: 'A' } },
          },
          {
            id: 'b',
            when: { status: 'done' },
            then: { function_id: 'fn::slow', payload: { tag: 'B' } },
          },
        ],
      }),
    );

    const order: string[] = [];
    let inFlight = 0;
    let overlap = 0;
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'fn::slow') {
          const payload = req.payload as { tag: string };
          inFlight += 1;
          if (inFlight > 1) overlap += 1;
          order.push(`start:${payload.tag}`);
          return new Promise((resolve) => {
            setTimeout(() => {
              order.push(`end:${payload.tag}`);
              inFlight -= 1;
              resolve({ ok: true });
            }, 30);
          });
        }
        return undefined;
      },
    });

    const fired = await loadFiredSet(sdk);
    const target: SessionState = { id: 'shared', agent: 'codex', status: 'done', updatedAt: 1 };

    await Promise.all([
      evaluateRules(sdk, fired, SCOPE, rulesPath, target),
      evaluateRules(sdk, fired, SCOPE, rulesPath, target),
    ]);

    expect(overlap).toBe(0);
    expect(order).toEqual(['start:A', 'end:A', 'start:B', 'end:B']);
  });
});

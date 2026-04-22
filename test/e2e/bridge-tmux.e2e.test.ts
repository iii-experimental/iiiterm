import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { writeFakeTmux } from './helpers/fake-bin.js';
import { listSessions, writeSession } from '../../src/state.js';
import { attachPanes } from '../../src/workers/bridge-tmux.js';
import type { SessionState } from '../../src/types.js';

const SCOPE = 'iiiterm:sessions';

let savedBin: string | undefined;
let tmpDir: string;

beforeEach(async () => {
  savedBin = process.env.IIITERM_TMUX_BIN;
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-tmux-'));
});

afterEach(async () => {
  if (savedBin === undefined) delete process.env.IIITERM_TMUX_BIN;
  else process.env.IIITERM_TMUX_BIN = savedBin;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E bridge-tmux', () => {
  it('attaches tmuxTarget + pid to sessions whose cwd matches a pane', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const paneTable = [
      'main:0.0\t10000\tzsh\t/home',
      'main:0.1\t10001\tclaude\t/work/app',
      'side:1.0\t10002\tcodex\t/work/other',
    ].join('\n');
    const bin = await writeFakeTmux(
      tmpDir,
      { 'list-panes': { stdout: paneTable } },
      logPath,
    );
    process.env.IIITERM_TMUX_BIN = bin;

    const sdk = stubSdk();
    const a: SessionState = {
      id: 'a',
      agent: 'claude-code',
      status: 'running',
      cwd: '/work/app',
      updatedAt: 1,
    };
    const b: SessionState = {
      id: 'b',
      agent: 'codex',
      status: 'idle',
      cwd: '/work/other',
      updatedAt: 1,
    };
    await writeSession(sdk, SCOPE, a);
    await writeSession(sdk, SCOPE, b);

    const updated = await attachPanes(sdk, SCOPE);
    expect(updated).toBe(2);

    const sessions = await listSessions(sdk, SCOPE);
    const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));
    expect(byId.a?.tmuxTarget).toBe('main:0.1');
    expect(byId.a?.pid).toBe(10001);
    expect(byId.b?.tmuxTarget).toBe('side:1.0');
    expect(byId.b?.pid).toBe(10002);
  });

  it('is a no-op when no pane runs a matching agent', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const paneTable = 'only:0.0\t9000\tzsh\t/home';
    const bin = await writeFakeTmux(
      tmpDir,
      { 'list-panes': { stdout: paneTable } },
      logPath,
    );
    process.env.IIITERM_TMUX_BIN = bin;

    const sdk = stubSdk();
    await writeSession(sdk, SCOPE, {
      id: 'a',
      agent: 'claude-code',
      status: 'idle',
      updatedAt: 1,
    });

    const updated = await attachPanes(sdk, SCOPE);
    expect(updated).toBe(0);
    const sessions = await listSessions(sdk, SCOPE);
    expect(sessions[0]?.tmuxTarget).toBeUndefined();
  });
});

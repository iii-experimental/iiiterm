import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { writeFakeTmux } from './helpers/fake-bin.js';
import { writeSession } from '../../src/state.js';
import { focusPane, killPane, sendKeys } from '../../src/tmux.js';
import type { SessionState } from '../../src/types.js';

const SCOPE = 'iiiterm:sessions';

let savedBin: string | undefined;
let tmpDir: string;

beforeEach(async () => {
  savedBin = process.env.IIITERM_TMUX_BIN;
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-actions-'));
});

afterEach(async () => {
  if (savedBin === undefined) delete process.env.IIITERM_TMUX_BIN;
  else process.env.IIITERM_TMUX_BIN = savedBin;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E actions tmux calls', () => {
  it('killPane spawns tmux kill-pane with the right target', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const bin = await writeFakeTmux(tmpDir, { 'kill-pane': {} }, logPath);
    process.env.IIITERM_TMUX_BIN = bin;

    const res = await killPane('main:0.1');
    expect(res.ok).toBe(true);
    const log = await readFile(logPath, 'utf8');
    expect(log).toContain('kill-pane -t main:0.1');
  });

  it('focusPane spawns tmux select-pane', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const bin = await writeFakeTmux(tmpDir, { 'select-pane': {} }, logPath);
    process.env.IIITERM_TMUX_BIN = bin;

    const res = await focusPane('main:0.1');
    expect(res.ok).toBe(true);
    const log = await readFile(logPath, 'utf8');
    expect(log).toContain('select-pane -t main:0.1');
  });

  it('sendKeys spawns tmux send-keys with prompt + Enter', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const bin = await writeFakeTmux(tmpDir, { 'send-keys': {} }, logPath);
    process.env.IIITERM_TMUX_BIN = bin;

    const res = await sendKeys('main:0.1', 'review the diff');
    expect(res.ok).toBe(true);
    const log = await readFile(logPath, 'utf8');
    expect(log).toContain('send-keys -t main:0.1 review the diff Enter');
  });

  it('forwards a non-zero exit from tmux as ok=false', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const bin = await writeFakeTmux(
      tmpDir,
      { 'kill-pane': { stderr: 'no such pane', exit: 1 } },
      logPath,
    );
    process.env.IIITERM_TMUX_BIN = bin;

    const res = await killPane('bogus:0.0');
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain('no such pane');
  });

  it('kill action end-to-end: state gets status=interrupted after success', async () => {
    const logPath = join(tmpDir, 'tmux.log');
    const bin = await writeFakeTmux(tmpDir, { 'kill-pane': {} }, logPath);
    process.env.IIITERM_TMUX_BIN = bin;

    const sdk = stubSdk();
    const session: SessionState = {
      id: 's1',
      agent: 'claude-code',
      status: 'running',
      tmuxTarget: 'main:0.1',
      updatedAt: 1,
    };
    await writeSession(sdk, SCOPE, session);

    /* replicate the action-worker kill path without starting the worker */
    const r = await killPane(session.tmuxTarget!);
    expect(r.ok).toBe(true);
    await writeSession(sdk, SCOPE, {
      ...session,
      status: 'interrupted',
      updatedAt: Date.now(),
    });

    const after = (await sdk.trigger({
      function_id: 'state::get',
      payload: { scope: SCOPE, key: 's1' },
    })) as { value: SessionState };
    expect(after.value.status).toBe('interrupted');
  });
});

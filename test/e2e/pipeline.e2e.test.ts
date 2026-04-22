import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { writeFakeTmux } from './helpers/fake-bin.js';
import { scanClaudeProjects } from '../../src/watchers/claude-code.js';
import { writeSession, listSessions } from '../../src/state.js';
import { attachPanes } from '../../src/workers/bridge-tmux.js';
import { evaluateRules, loadFiredSet } from '../../src/workers/router-core.js';
import { renderPane } from '../../src/render.js';

const SCOPE = 'iiiterm:sessions';

let savedBin: string | undefined;
let tmpDir: string;
let rulesPath: string;

beforeEach(async () => {
  savedBin = process.env.IIITERM_TMUX_BIN;
  tmpDir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-pipe-'));
  rulesPath = join(tmpDir, 'router.json');
});

afterEach(async () => {
  if (savedBin === undefined) delete process.env.IIITERM_TMUX_BIN;
  else process.env.IIITERM_TMUX_BIN = savedBin;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E pipeline: claude transcript -> state -> tmux attach -> router fires -> tui renders', () => {
  it('walks the full observation-coordination-render loop', async () => {
    /* 1. seed a claude transcript on disk */
    const claudeRoot = join(tmpDir, 'claude-projects');
    const projDir = join(claudeRoot, 'proj');
    await mkdir(projDir, { recursive: true });
    await writeFile(
      join(projDir, 'sess-1.jsonl'),
      [
        JSON.stringify({
          role: 'user',
          sessionId: 'sess-1',
          cwd: '/work/app',
          message: { content: 'ship the diff' },
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          role: 'assistant',
          sessionId: 'sess-1',
          message: { content: [{ type: 'text', text: 'done' }] },
          timestamp: new Date().toISOString(),
        }),
      ].join('\n'),
    );

    /* 2. fake tmux that reports one pane in /work/app running claude */
    const bin = await writeFakeTmux(
      tmpDir,
      {
        'list-panes': {
          stdout: 'main:0.1\t42000\tclaude\t/work/app',
        },
      },
      join(tmpDir, 'tmux.log'),
    );
    process.env.IIITERM_TMUX_BIN = bin;

    /* 3. router rule: when sess goes done, fire agent::codex::run */
    await writeFile(
      rulesPath,
      JSON.stringify({
        rules: [
          {
            id: 'cc-done-codex',
            when: { agent: 'claude-code', status: 'done' },
            then: {
              function_id: 'agent::codex::run',
              payload: { prompt: 'review' },
            },
          },
        ],
      }),
    );

    /* 4. track every cross-agent trigger from the router */
    const codexCalls: unknown[] = [];
    const sdk = stubSdk({
      onTrigger: (req) => {
        if (req.function_id === 'agent::codex::run') {
          codexCalls.push(req.payload);
          return { ok: true };
        }
        return undefined;
      },
    });

    /* 5. bridge-claude-code: scan + writeSession */
    const scanned = await scanClaudeProjects(claudeRoot);
    for (const s of scanned) await writeSession(sdk, SCOPE, s);

    /* 6. bridge-tmux: attach tmuxTarget + pid */
    const attached = await attachPanes(sdk, SCOPE);
    expect(attached).toBeGreaterThanOrEqual(1);

    /* 7. flip this session to `done` (simulating a completion event) and re-write */
    const [seeded] = await listSessions(sdk, SCOPE);
    expect(seeded?.tmuxTarget).toBe('main:0.1');
    await writeSession(sdk, SCOPE, { ...seeded!, status: 'done', updatedAt: Date.now() });

    /* 8. bridge-router: evaluate against the changed session */
    const fired = await loadFiredSet(sdk);
    const [current] = await listSessions(sdk, SCOPE);
    const fires = await evaluateRules(sdk, fired, SCOPE, rulesPath, current);
    expect(fires).toBe(1);
    expect(codexCalls).toHaveLength(1);

    /* 9. TUI renders the current state including the attached tmux target */
    const paneText = renderPane(await listSessions(sdk, SCOPE), { selectedIndex: 0 });
    expect(paneText).toContain('ship the diff');
    expect(paneText).toContain('/work/app');
  });
});

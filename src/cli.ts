#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] ?? 'up';

function run(script: string, inherit = true): void {
  const child = spawn(process.execPath, [join(here, script)], {
    stdio: inherit ? 'inherit' : 'pipe',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

switch (cmd) {
  case 'bridge:claude-code':
    run('workers/bridge-claude-code.js');
    break;
  case 'bridge:codex':
    run('workers/bridge-codex.js');
    break;
  case 'bridge:opencode':
    run('workers/bridge-opencode.js');
    break;
  case 'router':
    run('workers/bridge-router.js');
    break;
  case 'actions':
    run('workers/actions.js');
    break;
  case 'claude-worker':
    run('workers/claude-worker.js');
    break;
  case 'codex-worker':
    run('workers/codex-worker.js');
    break;
  case 'opencode-worker':
    run('workers/opencode-worker.js');
    break;
  case 'amp-worker':
    run('workers/amp-worker.js');
    break;
  case 'tui':
  case 'up':
    run('workers/tui.js');
    break;
  case 'help':
  default:
    console.log(`iiiterm — operator surface for agent swarms on iii

usage:
  iiiterm up                    start the operator pane (TUI worker)
  iiiterm tui                   alias for up
  iiiterm bridge:claude-code    Claude Code transcript watcher
  iiiterm bridge:codex          Codex rollout watcher
  iiiterm bridge:opencode       OpenCode SQLite watcher
  iiiterm router                cross-agent trigger router
  iiiterm actions               session action worker
  iiiterm claude-worker         agent::claude::run wrapper
  iiiterm codex-worker          agent::codex::run wrapper
  iiiterm opencode-worker       agent::opencode::run wrapper
  iiiterm amp-worker            agent::amp::run wrapper

env:
  IIITERM_ENGINE_URL      default ws://127.0.0.1:49134
  IIITERM_STATE_SCOPE     default iiiterm:sessions
  IIITERM_POLL_MS         default 1000
  CLAUDE_PROJECTS_DIR     default ~/.claude/projects
  CODEX_SESSIONS_DIR      default ~/.codex/sessions
  OPENCODE_DB_PATH        default ~/.local/share/opencode/opencode.db
  IIITERM_ROUTER_RULES    default ~/.config/iiiterm/router.json
  IIITERM_OPENCODE_QUERY  override SQL query for bridge-opencode
`);
}

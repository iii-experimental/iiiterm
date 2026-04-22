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
  iiiterm bridge:claude-code    run the Claude Code transcript watcher

env:
  IIITERM_ENGINE_URL    default ws://127.0.0.1:49134
  IIITERM_STATE_SCOPE   default iiiterm:sessions
  IIITERM_POLL_MS       default 1000
  CLAUDE_PROJECTS_DIR   default ~/.claude/projects
`);
}

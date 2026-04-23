# iiiterm

**The multi-agent orchestrator that won't fire the next step unless the last one really passed.**

iiiterm runs many AI coding agents side by side in tmux, one pane per role, each in an isolated git worktree. Cross-agent coordination goes through a verify gate: no rule fires until tests / lint / types / build / diff actually pass. "Done" means verified, not claimed.

Built as a family of narrow iii workers. One for each agent CLI you already use, one each for observation, coordination, verification, and control. Compose what you need, skip what you don't. The engine is the coordination layer; iiiterm is the seats you watch from and the knobs you turn. Works across machines — every session carries its host.

[![ci](https://github.com/iii-experimental/iiiterm/actions/workflows/ci.yml/badge.svg)](https://github.com/iii-experimental/iiiterm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/iiiterm.svg)](https://www.npmjs.com/package/iiiterm)

## What you get

```
+-- terminal ----------------------------------------------+
|  +-- tmux --------------------------------------------+  |
|  |  pane 1: claude code (plan)                        |  |
|  |  pane 2: codex (code)                              |  |
|  |  pane 3: opencode (review)                         |  |
|  |  pane 4: [iiiterm sidebar]                         |  |
|  +----------------------------------------------------+  |
+----------------------------------------------------------+
           |             |             |
           v             v             v
           +---------- iii engine ------+
             state . triggers . traces
```

- Every running agent is visible in the sidebar, updated the moment a transcript changes.
- The same data drives a browser peer on any device pointed at the engine.
- Agents coordinate through router rules with verify gates (tests/lint/types/build/diff-clean).
- `iiiterm run --team <name>` spawns a full team of agents into tmux panes with a worktree per role.
- Kill, reattach, or resend prompts into any pane from the sidebar.
- Agents are also callable as iii functions — `iii.trigger('agent::claude::run', { prompt })`.

## Workers (30)

iiiterm ships as a family of narrow workers. Run only the pieces you need.

### Bridges (6)
| worker | function / role |
| --- | --- |
| `bridge-claude-code` | watches `~/.claude/projects/*.jsonl`, writes SessionState |
| `bridge-codex` | watches `~/.codex/sessions/rollout-*.json`, writes SessionState |
| `bridge-opencode` | polls opencode SQLite, writes SessionState |
| `bridge-tmux` | matches tmux panes to sessions by agent + cwd, attaches tmuxTarget + pid |
| `bridge-lifecycle` | prunes stale sessions from state with per-status thresholds |
| `bridge-router` | evaluates rules against state changes, fires cross-agent triggers |

### Operator surface (2)
| worker | role |
| --- | --- |
| `tui` | terminal pane renderer, keybindings (x/r/s/q, j/k/arrows) |
| `actions` | `iiiterm::session::kill / reattach / resend` |

### Harness (3)
| worker | role |
| --- | --- |
| `spawner` | `iiiterm::spawn::agent` — launches agent CLI into a tmux pane, seeds SessionState |
| `worktree-manager` | `iiiterm::worktree::create / remove / list` |
| `review` | `iiiterm::review::diff / merge / discard` |

### Verifiers (5)
| worker | function |
| --- | --- |
| `verify-tests` | `verify::tests_passed` (`IIITERM_TEST_CMD`, default `npm test --silent`) |
| `verify-lint` | `verify::lint_clean` (`IIITERM_LINT_CMD`, default `npm run lint --silent`) |
| `verify-types` | `verify::types_ok` (`IIITERM_TYPES_CMD`, default `npx tsc --noEmit`) |
| `verify-build` | `verify::build_ok` (`IIITERM_BUILD_CMD`, default `npm run build --silent`) |
| `verify-diff-clean` | `verify::diff_clean` (pure git porcelain + unmerged check) |

### Platform (3)
| worker | role |
| --- | --- |
| `http-api` | `POST /set-status /set-progress /log /notify` on `127.0.0.1:7391` |
| `plugin-host` | loads user plugins from `~/.config/iiiterm/plugins/` |
| `stop-hook` | handoff backend for Claude Code / Codex Stop hooks |

### Agent wrappers (10)
| worker | function | default bin |
| --- | --- | --- |
| `claude-worker` | `agent::claude::run` | `claude` |
| `codex-worker` | `agent::codex::run` | `codex` |
| `opencode-worker` | `agent::opencode::run` | `opencode` |
| `amp-worker` | `agent::amp::run` | `amp` |
| `gemini-worker` | `agent::gemini::run` | `gemini` |
| `cursor-worker` | `agent::cursor::run` | `cursor-agent` |
| `copilot-worker` | `agent::copilot::run` | `gh` (`gh copilot suggest`) |
| `aider-worker` | `agent::aider::run` | `aider` |
| `qwen-worker` | `agent::qwen::run` | `qwen` |
| `generic-agent-worker` | `agent::<IIITERM_AGENT_NAME>::run` | `IIITERM_AGENT_BIN` |

Every agent wrapper accepts an optional `stream: { writerRef, engineWsBase }` in the payload to receive partial output via iii channels instead of buffering to process exit.

### Peripherals
- `web/` — Vite + React browser peer on `ws://127.0.0.1:49135`
- `iiiterm.tmux` — TPM plugin with `prefix + o` sidebar toggle
- `iiiterm run --team …` — CLI orchestrator
- `iiiterm setup` — seed default teams + `CLAUDE.md` block

All workers share one state scope: `iiiterm:sessions`. The scope is the contract.

## Install

Requires Node 20+ and a running iii engine on `ws://127.0.0.1:49134` (plus `ws://127.0.0.1:49135` for the browser peer).

```sh
npm i -g iiiterm
iiiterm setup        # seeds default teams + CLAUDE.md iiiterm block
```

Optional, for opencode:

```sh
npm i -g better-sqlite3
```

## Quick start

Each worker is its own process. Start only the pieces you want. From inside a tmux session:

```sh
# observability
iiiterm bridge:claude-code &
iiiterm bridge:codex &
iiiterm bridge:opencode &
iiiterm bridge:tmux &
iiiterm bridge:lifecycle &

# coordination
iiiterm router &
iiiterm actions &
iiiterm spawner &
iiiterm worktree &
iiiterm review &

# verifiers (enable whichever you want router rules to gate on)
iiiterm verify-tests &
iiiterm verify-diff-clean &

# platform extras (optional)
iiiterm http-api &
iiiterm plugin-host &
iiiterm stop-hook &

# operator pane
iiiterm up

# orchestrate a team
iiiterm run --team verified-review --prompt "refactor billing"
# or inline:
iiiterm run --team claude-code,codex --prompt "ship it"
```

## Browser peer

```sh
git clone https://github.com/iii-experimental/iiiterm
cd iiiterm/web
npm install
npm run dev
```

## tmux plugin

```tmux
set -g @plugin 'iii-experimental/iiiterm'
```

Reload tmux, install plugins, press `prefix + o` to toggle the sidebar. See `integrations/tmux/README.md`.

## Router rule examples

### Basic fire

```json
{ "id": "claude-done-wakes-codex",
  "when": { "agent": "claude-code", "status": "done" },
  "then": { "function_id": "agent::codex::run",
            "payload": { "prompt": "review the diff" } } }
```

### Verifier gate

```json
{ "id": "merge-only-on-green-tests",
  "when": { "agent": "codex", "status": "done" },
  "verify": { "function_id": "verify::tests_passed", "payload": {} },
  "then": { "function_id": "iiiterm::review::merge",
            "payload": { "strategy": "squash" } } }
```

### Structured handoff

```json
[
  { "id": "capture-plan",
    "when": { "agent": "claude-code", "status": "done" },
    "then": { "function_id": "fn::produce_plan", "payload": {} },
    "capture": { "as": "plan" } },
  { "id": "consume-plan",
    "when": { "agent": "codex", "status": "waiting" },
    "requires": [{ "name": "plan" }],
    "then": { "function_id": "fn::use_plan", "payload": {} } }
]
```

Router rules live in `~/.config/iiiterm/router.json` (override with `IIITERM_ROUTER_RULES`). Fired keys persist in engine state so a router restart does not re-fire the same transition.

## Config (env)

```
# engine
IIITERM_ENGINE_URL        ws://127.0.0.1:49134
IIITERM_STATE_SCOPE       iiiterm:sessions
IIITERM_POLL_MS           1000 (min 1000)
IIITERM_HOST              os.hostname()

# transcript sources
CLAUDE_PROJECTS_DIR       ~/.claude/projects
CODEX_SESSIONS_DIR        ~/.codex/sessions
OPENCODE_DB_PATH          ~/.local/share/opencode/opencode.db
AMP_THREADS_DIR           ~/.local/share/amp/threads

# scan behavior
IIITERM_SCAN_MAX_AGE_MS   (unset) — skip transcripts older than N ms
IIITERM_OPENCODE_QUERY    override SQL for bridge-opencode

# lifecycle pruning
IIITERM_PRUNE_RUNNING_MS  180000
IIITERM_PRUNE_WAITING_MS  180000
IIITERM_PRUNE_TERMINAL_MS 300000
IIITERM_PRUNE_IDLE_MS     1800000

# router
IIITERM_ROUTER_RULES      ~/.config/iiiterm/router.json

# verifier commands
IIITERM_TEST_CMD          npm test --silent
IIITERM_LINT_CMD          npm run lint --silent
IIITERM_TYPES_CMD         npx tsc --noEmit
IIITERM_BUILD_CMD         npm run build --silent

# agent CLIs
IIITERM_CLAUDE_BIN        claude
IIITERM_CODEX_BIN         codex
IIITERM_OPENCODE_BIN      opencode
IIITERM_AMP_BIN           amp
IIITERM_GEMINI_BIN        gemini
IIITERM_CURSOR_BIN        cursor-agent
IIITERM_COPILOT_BIN       gh
IIITERM_AIDER_BIN         aider
IIITERM_QWEN_BIN          qwen
IIITERM_OPENCLAW_BIN      openclaw
IIITERM_HERMES_BIN        hermes

# generic agent wrapper
IIITERM_AGENT_NAME        (required for generic-agent-worker)
IIITERM_AGENT_BIN         (required)
IIITERM_AGENT_ARGS        "-- {{prompt}}"
IIITERM_AGENT_STDIN       "1" to pipe prompt via stdin

# platform
IIITERM_HTTP_PORT         7391
IIITERM_HTTP_BIND         127.0.0.1
IIITERM_PLUGINS_DIR       ~/.config/iiiterm/plugins
IIITERM_STOP_HOOK_HANDOFF ~/.iiiterm/stop-hook-handoff.json
IIITERM_TMUX_BIN          tmux (test override)
```

## Layout

```
iiiterm/
├── src/
│   ├── types.ts                      SessionState + AgentKind + VerifyOutcome
│   ├── config.ts                     env loader + pollMs clamp + scan cutoff
│   ├── paths.ts                      tilde-expand helper
│   ├── host.ts                       IIITERM_HOST / os.hostname() (cached)
│   ├── lifecycle.ts                  SIGINT/SIGTERM cleanup registry
│   ├── errors.ts                     error reporter -> engine::log::error
│   ├── state.ts                      writeSession + getSession + listSessions
│   ├── render.ts                     ANSI pane renderer
│   ├── router.ts                     rule types + loader + matcher
│   ├── tmux.ts                       tmux kill/focus/send-keys/listPanes/pickPane
│   ├── git.ts                        git wrapper + listWorktrees + diffSummary
│   ├── harness.ts                    loadTeam + runTeam
│   ├── sessions/
│   │   ├── unseen.ts                 terminal-state transition rule
│   │   └── decode.ts                 Claude project-dir slug decode
│   ├── watchers/
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── opencode.ts
│   │   └── tail.ts                   tail-read for transcripts > 1 MB
│   ├── agents/
│   │   ├── run.ts                    spawn helper + onChunk hook
│   │   └── stream.ts                 AgentStreamRef -> ChannelWriter bridge
│   ├── verifiers/
│   │   └── run.ts                    shell runner + timeout-kill + capture
│   ├── plugins/
│   │   └── contract.ts               PluginContext + PluginFactory types
│   ├── workers/                      30 workers, listed above
│   ├── cli.ts                        subcommand entry
│   ├── cli-run.ts                    `iiiterm run --team` orchestrator
│   └── cli-setup.ts                  `iiiterm setup` seeder
├── test/                             39 files, 146 tests
├── web/                              Vite + React browser peer
├── integrations/tmux/                TPM plugin scripts
├── iiiterm.tmux                      TPM entry point
└── examples/                         teams/ + router/ + router.example.json
```

## Development

```sh
git clone https://github.com/iii-experimental/iiiterm
cd iiiterm
npm install
npm run lint
npm test
npm run build
```

Hot-run any worker without building:

```sh
npm run dev:bridge        # bridge-claude-code
npm run dev:tmux          # bridge-tmux
npm run dev:router        # bridge-router
npm run dev:actions       # actions
npm run dev:tui           # tui
npm run dev:spawner       # spawner
npm run dev:run           # cli-run
npm run dev:setup         # cli-setup
npm run dev:verify-tests  # verify-tests worker
# ...see package.json scripts for the full list
```

## Roadmap

- [x] v0.1–v0.6 — core bridges, TUI, router, browser peer, actions, tmux plugin
- [x] v0.7–v0.7.1 — agent-call wrappers + safety fixes from plan-eng-review
- [x] v0.8–v0.9 — vitest suite, bridge-tmux, tail-read, engine::log::error routing
- [x] v0.10–v0.11 — npm publish + CI/CD, end-to-end test suite
- [x] v0.12 — agent streaming via iii channels
- [x] v0.13 — stale-session pruning, codex status event map, router verify gate
- [x] v0.14 — parallel harness (`iiiterm run --team`), spawner, worktree-manager, review
- [x] v0.15 — verifier-first (tests/lint/types/build/diff-clean), multi-machine, `iiiterm setup`
- [x] v0.16 — unseen tracker, Claude slug decode, scan age cutoff, threadId
- [x] v0.17 — http-api, plugin-host, stop-hook
- [x] v0.18 — router captures + requires, per-session mutex
- [x] v0.19 — agent sprawl (gemini, cursor, copilot, aider, qwen, generic)
- [ ] v0.20 — CDP browser workers, MCP server exposing iiiterm, cluster dashboard
- [ ] v0.21 — graduate stable bridges to `iii-hq/workers` as independent packages
- [ ] v1.0 — first stable release once the above settle in real use

## Design

- Everything is a narrow iii worker. One scope per worker. No cross-scope reads.
- State is the contract. New bridges + peers only read and write `iiiterm:sessions`.
- Workers talk only through `iii.trigger()` and state, never by importing each other.
- Config is env-only. No daemon config file, no TOML, no YAML.
- The browser peer is a worker too, on port 49135 through `iii-browser-sdk`.
- Verifiers are first-class router gates. "Done" means verified.

See `AGENTS.md` for working-on-this-repo conventions.

## License

MIT

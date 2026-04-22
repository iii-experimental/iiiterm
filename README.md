# iiiterm

Operator surface for agent swarms on [iii](https://github.com/iii-hq/iii).

iiiterm is a family of narrow iii workers. One for each agent CLI you already use. One each for observation, coordination, and control. Compose what you need, skip what you don't. The engine is the coordination layer; iiiterm is the seats you watch from and the knobs you turn.

[![ci](https://github.com/iii-experimental/iiiterm/actions/workflows/ci.yml/badge.svg)](https://github.com/iii-experimental/iiiterm/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/iiiterm.svg)](https://www.npmjs.com/package/iiiterm)

## What you get

```
+-- terminal ----------------------------------------------+
|  +-- tmux --------------------------------------------+  |
|  |  pane 1: claude code (your session)                |  |
|  |  pane 2: codex (your session)                      |  |
|  |  pane 3: opencode (your session)                   |  |
|  |  pane 4: [iiiterm sidebar]   status of all panes   |  |
|  +----------------------------------------------------+  |
+----------------------------------------------------------+
           |             |             |
           v             v             v
           +---------- iii engine  -----+
              state . triggers . traces
```

- Every running agent is visible in the sidebar, updated the moment a transcript changes.
- The same data drives a browser peer on any device you point at the engine.
- Agents can fire triggers at each other through the router (Claude finishes → Codex reviews).
- The operator can kill, reattach, or resend a prompt into any pane from the sidebar.
- Agents can also be called as iii workers — `iii.trigger('agent::claude::run', { prompt })` from any worker.

## Workers

Every capability is a narrow iii worker you run on its own:

| worker | role |
| --- | --- |
| `bridge-claude-code` | reads `~/.claude/projects/*.jsonl`, writes SessionState to engine |
| `bridge-codex` | reads `~/.codex/sessions/rollout-*.json`, writes SessionState |
| `bridge-opencode` | polls opencode SQLite, writes SessionState |
| `bridge-tmux` | matches tmux panes to sessions by agent CLI + cwd, attaches tmuxTarget + pid |
| `bridge-router` | evaluates rules against state changes, fires cross-agent triggers |
| `actions` | registers `iiiterm::session::kill / reattach / resend` |
| `tui` | renders the operator pane in a terminal, handles keybindings |
| `claude-worker` | `agent::claude::run` — spawns Claude Code headlessly |
| `codex-worker` | `agent::codex::run` — spawns Codex non-interactively |
| `opencode-worker` | `agent::opencode::run` — spawns OpenCode non-interactively |
| `amp-worker` | `agent::amp::run` — spawns Amp non-interactively |
| web peer (`web/`) | Vite + React dashboard using `iii-browser-sdk` on port 49135 |
| tmux plugin | TPM-installable sidebar toggle, `prefix + o` |

All workers share one state scope — `iiiterm:sessions` by default. The scope is the contract. Any future worker reads and writes the same shape.

## Install

Requires Node 20+ and a running iii engine on `ws://127.0.0.1:49134` (plus `ws://127.0.0.1:49135` for the browser peer).

```sh
npm i -g iiiterm
```

Optional, for opencode support:

```sh
npm i -g better-sqlite3
```

## Quick start

Each worker is its own process. Start only the pieces you want.

```sh
# observability
iiiterm bridge:claude-code &
iiiterm bridge:codex &
iiiterm bridge:opencode &
iiiterm bridge:tmux &

# coordination
iiiterm router &
iiiterm actions &

# operator surface
iiiterm up              # the terminal pane, usually run in a tmux split

# agent wrappers (only if you want to call agents via iii.trigger)
iiiterm claude-worker &
iiiterm codex-worker &
iiiterm opencode-worker &
iiiterm amp-worker &
```

## tmux plugin

Add to `~/.tmux.conf`:

```tmux
set -g @plugin 'iii-experimental/iiiterm'
```

Reload tmux, install plugins, then press `prefix + o` to toggle the iiiterm sidebar. See `integrations/tmux/README.md` for env overrides.

## Browser peer

```sh
git clone https://github.com/iii-experimental/iiiterm
cd iiiterm/web
npm install
npm run dev
```

Opens a dashboard that connects to the engine on `ws://127.0.0.1:49135` and reads the same state scope as the terminal pane.

## Router example

`~/.config/iiiterm/router.json`:

```json
{
  "rules": [
    {
      "id": "claude-done-wakes-codex",
      "when": { "agent": "claude-code", "status": "done" },
      "then": {
        "function_id": "agent::codex::run",
        "payload": { "prompt": "Review the latest diff. Report issues only." }
      },
      "once": true
    }
  ]
}
```

Start `iiiterm router` and the moment any Claude Code session transitions to `done`, the router fires `agent::codex::run`. Because `agent::codex::run` is just another iii function, the coordination is observable in the engine trace.

`fired` keys live in engine state so a router restart does not re-fire the same transition.

A full example lives at `examples/router.example.json`.

## Config

All config is via env vars. Defaults shown.

```
IIITERM_ENGINE_URL      ws://127.0.0.1:49134
IIITERM_STATE_SCOPE     iiiterm:sessions
IIITERM_POLL_MS         1000 (min 1000)
CLAUDE_PROJECTS_DIR     ~/.claude/projects
CODEX_SESSIONS_DIR      ~/.codex/sessions
OPENCODE_DB_PATH        ~/.local/share/opencode/opencode.db
AMP_THREADS_DIR         ~/.local/share/amp/threads
IIITERM_ROUTER_RULES    ~/.config/iiiterm/router.json
IIITERM_OPENCODE_QUERY  override SQL for bridge-opencode
IIITERM_CLAUDE_BIN      claude
IIITERM_CODEX_BIN       codex
IIITERM_OPENCODE_BIN    opencode
IIITERM_AMP_BIN         amp
```

## Layout

```
iiiterm/
├── src/
│   ├── types.ts                      SessionState + enums
│   ├── config.ts                     env loader + pollMs clamp
│   ├── paths.ts                      tilde-expand helper
│   ├── lifecycle.ts                  SIGINT/SIGTERM cleanup registry
│   ├── errors.ts                     structured error reporter, routes to engine::log::error
│   ├── state.ts                      state::set / list / get helpers
│   ├── render.ts                     ANSI pane renderer
│   ├── router.ts                     rule loader + matcher
│   ├── tmux.ts                       tmux wrapper (kill / focus / send-keys / listPanes)
│   ├── watchers/
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── opencode.ts
│   │   └── tail.ts                   tail-read for files > 1 MB
│   ├── agents/
│   │   └── run.ts                    spawn helper for agent-* workers
│   ├── workers/
│   │   ├── bridge-claude-code.ts
│   │   ├── bridge-codex.ts
│   │   ├── bridge-opencode.ts
│   │   ├── bridge-tmux.ts
│   │   ├── bridge-router.ts
│   │   ├── router-core.ts
│   │   ├── actions.ts
│   │   ├── tui.ts
│   │   ├── claude-worker.ts
│   │   ├── codex-worker.ts
│   │   ├── opencode-worker.ts
│   │   └── amp-worker.ts
│   └── cli.ts                        subcommand entry
├── test/                             vitest suite (60+ tests)
├── web/                              Vite + React browser peer
├── integrations/tmux/                TPM plugin scripts
├── iiiterm.tmux                      TPM entry point
├── examples/router.example.json
└── .github/workflows/                ci.yml + publish.yml
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
```

## Roadmap

- [x] v0.1.0 — `bridge-claude-code` + `tui`
- [x] v0.2.0 — `bridge-codex`, `bridge-opencode`
- [x] v0.3.0 — browser peer via `iii-browser-sdk`
- [x] v0.4.0 — `bridge-router` for cross-agent triggers
- [x] v0.5.0 — session actions (`kill`, `reattach`, `resend`) + TUI keybindings
- [x] v0.6.0 — tmux plugin (`prefix + o` sidebar toggle)
- [x] v0.7.0 — `claude-worker` / `codex-worker` / `opencode-worker` / `amp-worker` as iii functions
- [x] v0.7.1 — safety fixes (persistent router dedup, shutdown hooks, argv escape, etc.)
- [x] v0.8.0 — `bridge-tmux` pane attachment + vitest suite with A1 regression
- [x] v0.9.0 — tail-read for huge transcripts + engine::log::error routing
- [x] v0.10.0 — npm publish + CI/CD pipeline
- [x] v0.11.0 — end-to-end test suite covering every worker pipeline
- [ ] v0.12.0 — stream partial agent output through iii channels instead of waiting for process exit
- [ ] v0.13.0 — graduate stable bridges to `iii-hq/workers` as independent packages
- [ ] v1.0.0 — first stable release once the above settle in real use

## Design

- Everything is a narrow iii worker. One scope per worker. No cross-scope reads.
- State is the contract. New bridges and new peers only need to write or read `iiiterm:sessions`.
- Workers talk only through `iii.trigger()` and state, never by importing each other.
- Config is env-only. No daemon config file, no TOML, no YAML.
- The browser peer is a worker too, on port 49135 through `iii-browser-sdk`.

## License

MIT

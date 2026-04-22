# iiiterm

Operator surface for agent swarms on [iii](https://github.com/iii-hq/iii).

Watches your running coding agents (Claude Code today, Codex / OpenCode / Amp next), pushes session state to the iii engine, and renders a live operator pane into tmux or a browser peer. Everything is a narrow iii worker — compose what you need, skip what you don't.

## Status

Pre-alpha. v0.1.0 ships one watcher (`bridge-claude-code`) and a terminal pane (`tui`). Both are iii workers. Both use `iii-sdk` primitives and nothing else.

## Why

Multi-agent dev looks like this today:

```
ghostty / wezterm / iterm
└── tmux
    ├── claude code (session 1)
    ├── claude code (session 2)
    ├── codex (session 3)
    ├── opencode (session 4)
    └── ???
```

Visibility is stdout. Coordination is you, switching panes. Existing tmux-sidecar tools (atmux, opensessions, various wmux forks) solve the visibility half with a sidebar. None wire the agents to each other.

iiiterm takes the same operator surface and puts it on top of iii. The same state store that drives the pane can drive cross-agent triggers, retries, traces, and policy. One layer, not two.

## Architecture

Three narrow workers, each its own iii function registry:

| worker | role |
| --- | --- |
| `bridge-claude-code` | reads `~/.claude/projects/*.jsonl`, parses transcripts, writes `state::set` per session |
| `bridge-*` (roadmap) | same pattern for Codex, OpenCode, Amp |
| `tui` | renders sessions from state to a terminal pane, redraws on `state` trigger |

All state lives in the iii engine under scope `iiiterm:sessions`. Any other worker (browser peer, dashboard, cross-agent router) can subscribe.

## Install

```sh
npm i -g iiiterm
```

Requires a running iii engine on `ws://127.0.0.1:49134`. Install the engine: `curl -fsSL install.iii.dev/iii/main/install.sh | sh`.

## Run

```sh
iiiterm bridge:claude-code &   # start the watcher worker
iiiterm up                     # render the operator pane
```

Open a tmux pane for `iiiterm up` and another for `iiiterm bridge:claude-code`. Both connect to the same engine. Stop either one and the other keeps working.

## Layout

```
src/
  types.ts                      SessionState, AgentKind, status enum
  config.ts                     env loading, path expansion
  state.ts                      state::set / state::list / state::get helpers
  render.ts                     ANSI pane renderer
  watchers/
    claude-code.ts              JSONL transcript parser
  workers/
    bridge-claude-code.ts       cron trigger → scanClaudeProjects → writeSession
    tui.ts                      state trigger + interval → renderPane
  cli.ts                        subcommand entry
```

## Roadmap

- [x] v0.1.0 — `bridge-claude-code` + `tui`
- [ ] v0.2.0 — `bridge-codex`, `bridge-opencode` (narrow worker each)
- [ ] v0.3.0 — browser peer via `iii-browser-sdk` on port 49135, subscribes to same state scope
- [ ] v0.4.0 — `bridge-router` worker: cross-agent triggers (one agent's `done` event wakes another)
- [ ] v0.5.0 — session actions from the pane (kill, reattach, resend)
- [ ] v0.6.0 — tmux pane integration (native splits, `prefix → o`)
- [ ] graduate individual bridges to `iii-hq/workers` once stable

## Contributing

This lives in `iii-experimental` while the worker decomposition is in flux. Once `bridge-claude-code` holds up in real use it graduates to `iii-hq/workers` as its own registry entry.

## License

MIT

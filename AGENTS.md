# AGENTS.md (iiiterm)

Instructions for any AI agent or contributor working inside this repo. Read this file before opening an issue, writing code, or shipping a commit. Keep it in sync with reality — stale rules are worse than no rules.

## What iiiterm is

iiiterm is a multi-agent orchestrator: many AI coding CLIs running side by side in tmux, coordinated through the iii engine, gated by verifiers. It is a family of narrow iii workers — not one monolith. Every capability is its own worker. The state scope `iiiterm:sessions` is the contract between them.

Full product surface is documented in README.md. When in doubt, that is the single source of truth for what the tool does; this file is the source of truth for how to change it.

## Golden rules

1. **Everything flows through iii primitives.** `registerFunction`, `registerTrigger`, `iii.trigger()`. Do not import workers from other workers. State is the bus. If two workers need to coordinate, they do it via state + triggers, nothing else.
2. **One scope per worker.** `iiiterm:sessions` is the session registry. `iiiterm:router:fired` is the router dedup set. `iiiterm:router:results` is the capture store. Do not cross these. New workers get their own scope.
3. **Narrow over tiered.** When a concern grows, split a new worker. Do not bolt a second concern onto an existing worker.
4. **Env-only config.** No TOML, no YAML, no daemon config files at runtime. Everything is `IIITERM_*` environment variables with sensible defaults. Document every new env in README under the "Config (env)" section.
5. **No cross-worker imports.** `src/workers/foo.ts` never imports `src/workers/bar.ts`. Shared helpers live under `src/`, `src/sessions/`, `src/watchers/`, `src/agents/`, `src/verifiers/`, `src/plugins/` — never in `src/workers/`.
6. **No external-tool artifacts in the repo.** Do not commit `.claude/`, `CLAUDE.md`, vendor skill directories, or any third-party indexer output. They go in `.gitignore`. The repo is source only.

## Layout rules

```
src/
  *.ts                         shared primitives (config, state, render, router, tmux, git, host, paths, lifecycle, errors, harness, types)
  sessions/                    pure helpers that operate on SessionState
  watchers/                    pure scan helpers for transcript sources
  agents/                      pure helpers for running agent CLIs (run.ts, stream.ts)
  verifiers/                   pure shell verifier primitives
  plugins/                     plugin contract + types
  workers/                     every *.ts here is a runnable worker (main() at module bottom)
  cli.ts                       top-level CLI dispatch
  cli-run.ts                   `iiiterm run --team` entrypoint
  cli-setup.ts                 `iiiterm setup` entrypoint

test/
  *.test.ts                    unit tests over pure logic
  e2e/*.e2e.test.ts            integration tests — fixtures on disk, fake binaries in tmpdir, stubbed SDK
  helpers/                     mock-sdk.ts + fake-bin.ts
```

New worker = new file under `src/workers/` + new case in `src/cli.ts` + new `dev:*` script in `package.json`. Never less, never more.

## Worker template

Every new worker follows this shape exactly:

```ts
import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-<name>',
  });
  attachSdkShutdown(iii);

  await iii.registerFunction(
    '<namespace>::<action>',
    async (input) => { /* ... */ },
    { description: 'one sentence explaining what this does' },
  );

  // Optional: registerTrigger with a cron / state / http config

  process.stdout.write(`[iiiterm] <name> up · <cfg summary>\n`);
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] <name> failed: ${String(err)}\n`);
  process.exit(1);
});
```

Rules:
- Always `attachSdkShutdown(iii)` so SIGINT/SIGTERM triggers engine disconnect.
- Always log a one-line "up" banner on start.
- No top-level side effects (imports + `main().catch(...)` only).
- Logs go to stderr. Operator text goes to stdout.

## State + session rules

- `src/state.ts` is the only module allowed to call `state::set` / `state::get` / `state::list` / `state::delete`. Everything else routes through `writeSession` / `getSession` / `listSessions`.
- `SessionState` in `src/types.ts` is the contract. Add fields, never rename them. Old readers must keep working.
- Bridge workers pass `{ computeUnseen: true }` when writing so terminal-state transitions light up the unseen flag.
- The host field is stamped from `iiitermHost()` (`IIITERM_HOST` or `os.hostname()`). Every bridge and the spawner already do this.

## Router rules

- Pure matching, capture, require, and verify logic lives in `src/router.ts` + `src/workers/router-core.ts`. The worker file `src/workers/bridge-router.ts` is thin plumbing.
- Fired-key scope: `iiiterm:router:fired`. Captured-result scope: `iiiterm:router:results`.
- Per-session mutex (`withSessionLock`) wraps `applyRule`. Never remove it — concurrent state writes race without it.
- When adding a new rule field: update the JSON schema comment in `examples/router.example.json`, add tests in `test/e2e/router-*.e2e.test.ts`.

## Tests

Every new worker, watcher, verifier, or helper ships with tests in the same PR.

- **Unit tests** for pure logic. Fast, no fixtures, no network.
- **E2E tests** under `test/e2e/`. Use `stubSdk()` from `test/helpers/mock-sdk.ts` for iii. Use `writeFakeBin()` / `writeFakeTmux()` from `test/e2e/helpers/fake-bin.ts` for CLIs + tmux.
- **Never** talk to a real iii engine from tests. Never touch the user's real home state. Always `mkdtemp` + `rm`.
- Target wall-clock for the full suite: under 5 seconds. If a single test pushes past 2 seconds, split it or mock harder.

Run before committing:

```sh
npm run lint
npm test
```

Both must be green. The suite is the source of truth for correctness of the pure logic; nothing else has been observed against a live engine.

## Commits

- One logical change per commit. No "and also..." commits.
- Commit title in present tense, ≤70 chars, no trailing period: `v0.20.0: add MCP server exposing iiiterm tools`
- Commit body: what + why + what landed where. Multi-paragraph is fine for version commits.
- Never amend published commits. Never force-push main unless explicitly asked.
- Do not include co-author trailers or "Generated with..." footers.
- Do not commit lockfiles (they are .gitignored).
- Do not commit local tooling artifacts. Keep external-tool outputs out of the tree.
- Never use `git add -A` if there are stray files — stage specific paths.

## Releases

Bump the version in `package.json`, commit, tag, push:

```sh
git tag v0.20.0
git push origin main v0.20.0
```

Tag push triggers `.github/workflows/publish.yml` — lint, test, build, npm publish (needs `NPM_TOKEN` secret), GitHub release with auto-generated notes.

Do not publish to npm manually. The only correct path is: commit → tag → push tag.

## Dependencies

- `iii-sdk` and `iii-browser-sdk` are pinned at `^0.11.2`. Bumping them is a versioned event — test the full suite, then the browser peer build, before accepting.
- `better-sqlite3` is an optionalDependency. Do not make it required. The opencode watcher bails cleanly when it is missing.
- `ws` is a devDependency only, used for potential WebSocket polyfills in tests. Do not ship it as runtime.
- No new runtime dependencies without a one-paragraph justification in the PR body.

## README invariants

Any of these changes means README.md must update in the same PR:

- A new worker was added (update the workers table).
- A new env var was introduced (update "Config (env)").
- A new CLI subcommand was added (update "Quick start").
- A new router rule field was introduced (update the rule examples).
- A major roadmap item landed (check the box + add a commit line).

If the README and code disagree, the code wins but the PR is not mergeable until they match.

## Scope discipline

Do not add features that do not fit the shape.

- No custom renderer — use ANSI in the TUI, HTML in the web peer.
- No GUI app. iiiterm lives inside tmux + browser.
- No new config formats. Env only.
- No framework wrappers in workers. Workers are plain Node + iii-sdk.
- No vendored agent CLIs. The generic-agent-worker exists specifically so new agents come online without a source change.

When in doubt: does this fit as one narrow worker? If yes, write it. If no, split it until it does.

## Caveat on live-engine confidence

The test suite proves pure logic. It does not prove behavior against a running iii engine. The first person to run this against a live engine will hit at least one shape mismatch (cron expression, state trigger payload, channel construction). That is fine — fix the shape, add a regression test, ship a patch version. Do not claim end-to-end correctness until a real smoke suite has run at least once.

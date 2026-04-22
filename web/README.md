# @iiiterm/web

Browser peer for `iiiterm`. Connects to the iii browser RBAC endpoint on `ws://127.0.0.1:49135`, subscribes to the same `iiiterm:sessions` state scope that the TUI reads, and renders the pane as a web dashboard.

Uses `iii-browser-sdk` — not REST, not HTTP polling. The browser is a first-class iii worker.

## Dev

```sh
cd web
npm install
npm run dev
```

Open the URL Vite prints. The page registers `ui::iiiterm::refresh` against the engine and subscribes to a `state` trigger on the sessions scope, so it updates the moment any bridge worker writes.

## Build

```sh
npm run build
```

Ships static assets to `web/dist`. Serve anywhere; the engine connection is client-side.

## Env

- `VITE_IIITERM_BROWSER_URL` — default `ws://127.0.0.1:49135`
- `VITE_IIITERM_STATE_SCOPE` — default `iiiterm:sessions`

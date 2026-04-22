# iiiterm tmux integration

Opens and closes the iiiterm operator pane inside your existing tmux workflow. Does not replace tmux; it uses it.

## Install with TPM

Requires [tmux](https://github.com/tmux/tmux), [Node.js 20+](https://nodejs.org), and [TPM](https://github.com/tmux-plugins/tpm).

Add to `~/.tmux.conf`:

```tmux
set -g @plugin 'iii-experimental/iiiterm'
```

Reload:

```sh
tmux source-file ~/.tmux.conf
~/.tmux/plugins/tpm/bin/install_plugins
```

Open or close the sidebar pane with `prefix` + `o`.

## Env overrides

- `IIITERM_TMUX_PREFIX`     — prefix key after tmux `prefix`. Default `o`.
- `IIITERM_SIDEBAR_WIDTH`   — sidebar width in columns. Default `52`.
- `IIITERM_SIDEBAR_SIDE`    — `right` (default) or `left`.
- `IIITERM_PANE_TITLE`      — pane title used to detect the existing sidebar. Default `iiiterm`.
- `IIITERM_LAUNCH_CMD`      — command to run inside the pane. Default `iiiterm up`.

Set these in your `~/.tmux.conf` via `set-environment -g`.

## Uninstall

```sh
sh ~/.tmux/plugins/iiiterm/integrations/tmux/scripts/uninstall.sh
```

Then remove the `set -g @plugin 'iii-experimental/iiiterm'` line from `~/.tmux.conf` and run `prefix + alt + u` to have TPM remove the checkout.

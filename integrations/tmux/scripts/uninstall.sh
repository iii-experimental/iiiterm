#!/usr/bin/env bash
# Remove iiiterm tmux bindings before deleting the plugin directory.

set -eu

PREFIX_KEY="${IIITERM_TMUX_PREFIX:-o}"

tmux unbind-key "$PREFIX_KEY" 2>/dev/null || true
tmux unbind-key -T iiiterm s 2>/dev/null || true
tmux unbind-key -T iiiterm t 2>/dev/null || true
tmux unbind-key -T iiiterm e 2>/dev/null || true
tmux unbind-key -T iiiterm q 2>/dev/null || true

tmux set-environment -gu IIITERM_PLUGIN_DIR 2>/dev/null || true

echo "iiiterm tmux bindings removed."

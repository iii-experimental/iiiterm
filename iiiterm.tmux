#!/usr/bin/env bash
# iiiterm.tmux — TPM entry point.
# Installs keybindings and resolves sidebar scripts using the repo this
# file was cloned into, so it works regardless of absolute path.

CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRIPTS_DIR="$CURRENT_DIR/integrations/tmux/scripts"

PREFIX_KEY="${IIITERM_TMUX_PREFIX:-o}"

tmux bind-key "$PREFIX_KEY" run-shell "$SCRIPTS_DIR/toggle-pane.sh"
tmux bind-key -T iiiterm s run-shell "$SCRIPTS_DIR/toggle-pane.sh"
tmux bind-key -T iiiterm t run-shell "$SCRIPTS_DIR/toggle-pane.sh"
tmux bind-key -T iiiterm e run-shell "$SCRIPTS_DIR/even-horizontal.sh"
tmux bind-key -T iiiterm q send-keys q

tmux set-environment -g IIITERM_PLUGIN_DIR "$CURRENT_DIR"

#!/usr/bin/env bash
# Apply tmux even-horizontal layout to the current window.
# Handy when the sidebar needs to share width cleanly with other panes.

set -eu

tmux select-layout even-horizontal

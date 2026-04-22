#!/usr/bin/env bash
# Toggle the iiiterm sidebar pane in the current tmux window.
# Creates it if missing, kills it if present.

set -eu

WIDTH="${IIITERM_SIDEBAR_WIDTH:-52}"
SIDE="${IIITERM_SIDEBAR_SIDE:-right}"
TITLE="${IIITERM_PANE_TITLE:-iiiterm}"
CMD="${IIITERM_LAUNCH_CMD:-iiiterm up}"

window_id="$(tmux display -p '#{window_id}')"

# Try to find an existing iiiterm pane in this window by title.
existing="$(tmux list-panes -t "$window_id" -F '#{pane_id} #{pane_title}' \
  | awk -v t="$TITLE" '$2 == t { print $1; exit }')"

if [ -n "$existing" ]; then
  tmux kill-pane -t "$existing"
  exit 0
fi

direction_flag="-h"
[ "$SIDE" = "left" ] && direction_flag="-hb"

pane_id="$(tmux split-window $direction_flag -l "$WIDTH" -P -F '#{pane_id}' "$CMD")"
tmux select-pane -t "$pane_id" -T "$TITLE"
tmux select-pane -t "$pane_id"

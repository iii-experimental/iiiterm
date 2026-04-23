import type { SessionState, SessionStatus } from '../types.js';

const TERMINAL: ReadonlySet<SessionStatus> = new Set(['done', 'error', 'interrupted']);

/**
 * Compute the unseen flag for an incoming state update given the previous
 * state.  Opensessions-style semantics: flip to true on transition into a
 * terminal state, clear on any non-terminal update, otherwise inherit.
 */
export function unseenForTransition(
  prev: SessionState | null,
  next: SessionState,
): boolean {
  const isTerminal = TERMINAL.has(next.status);
  if (!isTerminal) return false;
  if (!prev) return true;
  if (prev.status === next.status) return prev.unseen ?? false;
  return true;
}

import { describe, expect, it } from 'vitest';
import { unseenForTransition } from '../src/sessions/unseen.js';
import type { SessionState } from '../src/types.js';

function make(status: SessionState['status'], unseen?: boolean): SessionState {
  return { id: 's', agent: 'claude-code', status, updatedAt: 1, unseen };
}

describe('unseenForTransition', () => {
  it('flips to true when a new session lands terminal', () => {
    expect(unseenForTransition(null, make('done'))).toBe(true);
  });

  it('flips to true on transition running -> done', () => {
    expect(unseenForTransition(make('running'), make('done'))).toBe(true);
  });

  it('stays unseen when re-observed in the same terminal state', () => {
    expect(unseenForTransition(make('done', true), make('done'))).toBe(true);
  });

  it('clears on transition back to running', () => {
    expect(unseenForTransition(make('done', true), make('running'))).toBe(false);
  });

  it('never marks a non-terminal update unseen', () => {
    expect(unseenForTransition(null, make('running'))).toBe(false);
    expect(unseenForTransition(make('done'), make('waiting'))).toBe(false);
  });
});

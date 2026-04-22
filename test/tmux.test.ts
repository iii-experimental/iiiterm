import { describe, expect, it } from 'vitest';
import { paneMatchesAgent, pickPaneForSession, type TmuxPaneInfo } from '../src/tmux.js';

const panes: TmuxPaneInfo[] = [
  { target: 'main:0.0', pid: 1000, command: 'zsh', currentPath: '/home' },
  { target: 'main:0.1', pid: 1001, command: 'claude', currentPath: '/work/app' },
  { target: 'main:0.2', pid: 1002, command: '/usr/local/bin/codex', currentPath: '/work/other' },
  { target: 'side:1.0', pid: 1003, command: 'claude', currentPath: '/work/app/nested' },
];

describe('paneMatchesAgent', () => {
  it('matches by bare command name', () => {
    expect(paneMatchesAgent(panes[1]!, 'claude-code')).toBe(true);
    expect(paneMatchesAgent(panes[0]!, 'claude-code')).toBe(false);
  });

  it('matches by trailing path segment', () => {
    expect(paneMatchesAgent(panes[2]!, 'codex')).toBe(true);
  });
});

describe('pickPaneForSession', () => {
  it('returns undefined when no pane runs the agent', () => {
    expect(pickPaneForSession(panes, 'amp', '/work/app')).toBeUndefined();
  });

  it('prefers an exact cwd match', () => {
    expect(pickPaneForSession(panes, 'claude-code', '/work/app')?.target).toBe('main:0.1');
  });

  it('falls back to a prefix match', () => {
    expect(pickPaneForSession(panes, 'claude-code', '/work/app/deep/dir')?.target).toBe(
      'main:0.1',
    );
  });

  it('returns first match when cwd is missing', () => {
    expect(pickPaneForSession(panes, 'claude-code', undefined)?.target).toBe('main:0.1');
  });
});

import { describe, expect, it } from 'vitest';
import { renderPane } from '../src/render.js';
import type { SessionState } from '../src/types.js';

const s: SessionState = {
  id: 'a',
  agent: 'claude-code',
  title: 'refactor billing',
  cwd: '/tmp/app',
  status: 'running',
  lastTurnAt: Date.now() - 1200,
  tokensIn: 4200,
  tokensOut: 800,
  updatedAt: Date.now(),
};

describe('renderPane', () => {
  it('renders an empty-state hint when there are no sessions', () => {
    const out = renderPane([]);
    expect(out).toContain('no sessions yet');
  });

  it('renders rows with agent, title, and cwd', () => {
    const out = renderPane([s]);
    expect(out).toContain('claude');
    expect(out).toContain('refactor billing');
    expect(out).toContain('/tmp/app');
  });

  it('inverts the selected row', () => {
    const base = renderPane([s], { selectedIndex: -1 });
    const selected = renderPane([s], { selectedIndex: 0 });
    expect(selected).toContain('\x1b[7m');
    expect(base).not.toContain('\x1b[7m');
  });

  it('embeds the footer when provided', () => {
    expect(renderPane([s], { footer: 'ping ok' })).toContain('ping ok');
  });
});

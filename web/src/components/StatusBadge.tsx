import type { SessionStatus } from '../types';

const LABEL: Record<SessionStatus, { glyph: string; tone: string }> = {
  idle: { glyph: '·', tone: 'neutral' },
  running: { glyph: '●', tone: 'warn' },
  waiting: { glyph: '◌', tone: 'info' },
  done: { glyph: '✓', tone: 'success' },
  error: { glyph: '✗', tone: 'error' },
  interrupted: { glyph: '⚠', tone: 'alert' },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const { glyph, tone } = LABEL[status];
  return (
    <span className={`badge badge--${tone}`} title={status}>
      <span className="badge__glyph">{glyph}</span>
      <span className="badge__text">{status}</span>
    </span>
  );
}

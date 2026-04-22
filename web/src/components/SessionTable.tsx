import type { SessionState } from '../types';
import { StatusBadge } from './StatusBadge';

function ago(ts?: number): string {
  if (!ts) return '—';
  const d = Math.max(0, Date.now() - ts);
  if (d < 60_000) return `${Math.floor(d / 1000)}s`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

function tokens(n?: number): string {
  if (!n) return '—';
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function SessionTable({ sessions }: { sessions: SessionState[] }) {
  if (sessions.length === 0) {
    return <p className="empty">no sessions yet — run a bridge worker</p>;
  }
  const sorted = [...sessions].sort((a, b) => (b.lastTurnAt ?? 0) - (a.lastTurnAt ?? 0));
  return (
    <table className="table">
      <thead>
        <tr>
          <th>status</th>
          <th>agent</th>
          <th>title</th>
          <th>cwd</th>
          <th>ago</th>
          <th>in</th>
          <th>out</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <tr key={s.id}>
            <td><StatusBadge status={s.status} /></td>
            <td className="mono">{s.agent}</td>
            <td>{s.title ?? s.lastMessage ?? '(no title)'}</td>
            <td className="mono dim">{s.cwd ?? '—'}</td>
            <td className="mono">{ago(s.lastTurnAt)}</td>
            <td className="mono">{tokens(s.tokensIn)}</td>
            <td className="mono">{tokens(s.tokensOut)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

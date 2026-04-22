import { useEffect, useState } from 'react';
import { getClient, STATE_SCOPE } from './iii';
import type { SessionState } from './types';
import { SessionTable } from './components/SessionTable';

export function App() {
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  useEffect(() => {
    let cancelled = false;
    let registered = false;
    const iii = getClient();

    const refresh = async () => {
      try {
        const res = (await iii.trigger({
          function_id: 'state::list',
          payload: { scope: STATE_SCOPE },
        })) as { items?: Array<{ key: string; value: SessionState }> };
        if (cancelled) return;
        setSessions((res.items ?? []).map((i) => i.value));
        setStatus('live');
      } catch (err) {
        console.error('[iiiterm/web] refresh failed', err);
        if (!cancelled) setStatus('error');
      }
    };

    try {
      iii.registerFunction(
        'ui::iiiterm::refresh',
        async () => {
          await refresh();
          return { refreshed: true };
        },
        { description: 'Browser peer refresh, fired by state trigger' },
      );
      iii.registerTrigger({
        type: 'state',
        function_id: 'ui::iiiterm::refresh',
        config: { scope: STATE_SCOPE },
      });
      registered = true;
    } catch (err) {
      console.error('[iiiterm/web] register failed', err);
      if (!cancelled) setStatus('error');
    }

    void refresh();

    return () => {
      cancelled = true;
      if (registered) {
        try {
          iii.shutdown?.();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return (
    <main className="app">
      <header className="header">
        <h1>iiiterm</h1>
        <span className={`status status--${status}`}>{status}</span>
        <span className="meta">{sessions.length} sessions · scope {STATE_SCOPE}</span>
      </header>
      <SessionTable sessions={sessions} />
    </main>
  );
}

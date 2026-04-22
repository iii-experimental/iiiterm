import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { listSessions } from '../state.js';
import { renderPane } from '../render.js';
import type { SessionState } from '../types.js';

type Keypress =
  | { kind: 'up' }
  | { kind: 'down' }
  | { kind: 'kill' }
  | { kind: 'reattach' }
  | { kind: 'resend' }
  | { kind: 'quit' }
  | { kind: 'other' };

function parseKey(chunk: Buffer): Keypress {
  const s = chunk.toString();
  if (s === '\x03' || s === 'q') return { kind: 'quit' };
  if (s === '\x1b[A' || s === 'k') return { kind: 'up' };
  if (s === '\x1b[B' || s === 'j') return { kind: 'down' };
  if (s === 'x') return { kind: 'kill' };
  if (s === 'r' || s === '\r') return { kind: 'reattach' };
  if (s === '\n' || s === 's') return { kind: 'resend' };
  return { kind: 'other' };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-tui',
  });

  let latest: SessionState[] = [];
  let selected = 0;
  let status: string = '';

  const sortSessions = (list: SessionState[]): SessionState[] =>
    [...list].sort((a, b) => (b.lastTurnAt ?? 0) - (a.lastTurnAt ?? 0));

  const draw = (): void => {
    process.stdout.write(renderPane(latest, { selectedIndex: selected, footer: status }));
  };

  const refresh = async (): Promise<void> => {
    try {
      const list = await listSessions(iii, cfg.stateScope);
      latest = sortSessions(list);
      if (selected >= latest.length) selected = Math.max(0, latest.length - 1);
      draw();
    } catch (err) {
      status = `state list error: ${String(err)}`;
      draw();
    }
  };

  const callAction = async (fn: string, extra: Record<string, unknown> = {}): Promise<void> => {
    const s = latest[selected];
    if (!s) {
      status = 'no session selected';
      draw();
      return;
    }
    try {
      const res = (await iii.trigger({
        function_id: fn,
        payload: { id: s.id, ...extra },
      })) as { ok?: boolean; reason?: string };
      status = res.ok ? `${fn} → ok` : `${fn} → ${res.reason ?? 'error'}`;
    } catch (err) {
      status = `${fn} threw: ${String(err)}`;
    }
    draw();
  };

  await iii.registerFunction(
    'iiiterm::tui::refresh',
    async () => {
      await refresh();
      return { refreshed: true };
    },
    { description: 'Redraw the operator pane' },
  );

  await iii.registerTrigger({
    type: 'state',
    function_id: 'iiiterm::tui::refresh',
    config: { scope: cfg.stateScope },
    metadata: {},
  });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk: Buffer) => {
      const key = parseKey(chunk);
      switch (key.kind) {
        case 'quit':
          process.stdout.write('\x1b[?25h');
          process.exit(0);
          return;
        case 'up':
          selected = Math.max(0, selected - 1);
          draw();
          return;
        case 'down':
          selected = Math.min(latest.length - 1, selected + 1);
          draw();
          return;
        case 'kill':
          void callAction('iiiterm::session::kill');
          return;
        case 'reattach':
          void callAction('iiiterm::session::reattach');
          return;
        case 'resend':
          void callAction('iiiterm::session::resend');
          return;
        default:
          return;
      }
    });
  }

  process.stdout.write('\x1b[?25l');
  await refresh();
  setInterval(() => void refresh(), cfg.pollMs);
}

main().catch((err) => {
  console.error('[iiiterm] tui failed:', err);
  process.exit(1);
});

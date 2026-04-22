import { registerWorker } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { listSessions } from '../state.js';
import { renderPane } from '../render.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-tui',
  });

  const draw = async () => {
    try {
      const sessions = await listSessions(iii, cfg.stateScope);
      process.stdout.write(renderPane(sessions));
    } catch (err) {
      process.stderr.write(`[iiiterm] render error: ${String(err)}\n`);
    }
  };

  await iii.registerFunction(
    'iiiterm::tui::refresh',
    async () => {
      await draw();
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

  await draw();
  setInterval(() => void draw(), cfg.pollMs);
}

main().catch((err) => {
  console.error('[iiiterm] tui failed:', err);
  process.exit(1);
});

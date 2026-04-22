import type { ISdk } from 'iii-sdk';

type Cleanup = () => void | Promise<void>;

const cleanups: Cleanup[] = [];
let installed = false;

export function onShutdown(fn: Cleanup): void {
  cleanups.push(fn);
  if (installed) return;
  installed = true;

  const run = async (signal: string) => {
    process.stderr.write(`[iiiterm] received ${signal}, shutting down\n`);
    for (const c of cleanups) {
      try {
        await c();
      } catch (err) {
        process.stderr.write(`[iiiterm] cleanup error: ${String(err)}\n`);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void run('SIGINT');
  });
  process.on('SIGTERM', () => {
    void run('SIGTERM');
  });
}

export function attachSdkShutdown(iii: ISdk): void {
  onShutdown(async () => {
    try {
      await iii.shutdown();
    } catch {
      /* ignore */
    }
  });
}

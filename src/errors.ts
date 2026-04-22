import type { ISdk } from 'iii-sdk';

export type ErrorReporter = (ctx: string, err: unknown) => void;

export function stderrReporter(scope: string): ErrorReporter {
  return (ctx, err) => {
    process.stderr.write(`[${scope}] ${ctx}: ${String(err)}\n`);
  };
}

export function sdkReporter(iii: ISdk, source: string): ErrorReporter {
  return (ctx, err) => {
    const message = `[${source}] ${ctx}: ${String(err)}`;
    process.stderr.write(`${message}\n`);
    void iii
      .trigger({
        function_id: 'engine::log::error',
        payload: { source, context: ctx, error: String(err), ts: Date.now() },
      })
      .catch(() => {});
  };
}

import type { ISdk } from 'iii-sdk';

export interface StubSdkOptions {
  onTrigger?: (req: { function_id: string; payload: unknown; action?: unknown }) => unknown;
  state?: Map<string, Map<string, unknown>>;
}

export function stubSdk(opts: StubSdkOptions = {}): ISdk {
  const state = opts.state ?? new Map<string, Map<string, unknown>>();
  const trigger = async (req: {
    function_id: string;
    payload: Record<string, unknown>;
  }): Promise<unknown> => {
    if (opts.onTrigger) {
      const custom = opts.onTrigger(req);
      if (custom !== undefined) return custom;
    }
    switch (req.function_id) {
      case 'state::set': {
        const { scope, key, value } = req.payload as {
          scope: string;
          key: string;
          value: unknown;
        };
        let m = state.get(scope);
        if (!m) {
          m = new Map();
          state.set(scope, m);
        }
        m.set(key, value);
        return { set: true };
      }
      case 'state::get': {
        const { scope, key } = req.payload as { scope: string; key: string };
        return { value: state.get(scope)?.get(key) ?? null };
      }
      case 'state::list': {
        const { scope } = req.payload as { scope: string };
        const m = state.get(scope) ?? new Map();
        return { items: [...m.entries()].map(([key, value]) => ({ key, value })) };
      }
      case 'state::delete': {
        const { scope, key } = req.payload as { scope: string; key: string };
        state.get(scope)?.delete(key);
        return { deleted: true };
      }
      default:
        return undefined;
    }
  };
  const sdk = {
    trigger,
    registerFunction: () => ({}),
    registerTrigger: () => ({}),
    shutdown: async () => {},
  } as unknown as ISdk;
  return sdk;
}

export function stateFrom(sdk: ISdk): Map<string, Map<string, unknown>> {
  return (sdk as unknown as { __state: Map<string, Map<string, unknown>> }).__state;
}

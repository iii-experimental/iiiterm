import type { ISdk } from 'iii-sdk';
import type { SessionState } from '../types.js';

/**
 * A minimal contract for third-party watchers / spawners / verifiers to plug
 * into iiiterm without forking the repo.  Plugins are default-exported async
 * factory functions taking a PluginContext.
 */
export interface PluginContext {
  iii: ISdk;
  stateScope: string;
  engineUrl: string;
  host: string;
  writeSession: (s: SessionState) => Promise<void>;
  log: (ctx: string, info?: unknown) => void;
}

export type PluginFactory = (ctx: PluginContext) => Promise<void> | void;

export interface PluginModule {
  default: PluginFactory;
  name?: string;
}

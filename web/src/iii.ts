/// <reference types="vite/client" />
import { registerWorker, type ISdk } from 'iii-browser-sdk';

export const ENGINE_URL =
  (import.meta.env.VITE_IIITERM_BROWSER_URL as string | undefined) ??
  'ws://127.0.0.1:49135';

export const STATE_SCOPE =
  (import.meta.env.VITE_IIITERM_STATE_SCOPE as string | undefined) ??
  'iiiterm:sessions';

let client: ISdk | null = null;

export function getClient(): ISdk {
  if (client) return client;
  client = registerWorker(ENGINE_URL);
  return client;
}

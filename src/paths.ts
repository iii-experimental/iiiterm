import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function expand(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(1).replace(/^\//, ''));
  return resolve(p);
}

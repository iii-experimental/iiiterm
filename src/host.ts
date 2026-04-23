import { hostname } from 'node:os';

let cached: string | null = null;

export function iiitermHost(): string {
  if (cached) return cached;
  cached = process.env.IIITERM_HOST ?? hostname();
  return cached;
}

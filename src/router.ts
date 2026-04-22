import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { SessionState } from './types.js';

export interface RouterMatch {
  agent?: SessionState['agent'];
  status?: SessionState['status'];
  cwdIncludes?: string;
  titleIncludes?: string;
}

export interface RouterAction {
  function_id: string;
  payload?: Record<string, unknown>;
  action?: 'enqueue' | 'void';
  queue?: string;
}

export interface RouterRule {
  id?: string;
  description?: string;
  when: RouterMatch;
  then: RouterAction | RouterAction[];
  once?: boolean;
}

export interface RouterConfig {
  rules: RouterRule[];
}

export const EMPTY_CONFIG: RouterConfig = { rules: [] };

export async function loadRules(path: string): Promise<RouterConfig> {
  if (!existsSync(path)) return EMPTY_CONFIG;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RouterConfig>;
    if (!Array.isArray(parsed.rules)) return EMPTY_CONFIG;
    return { rules: parsed.rules };
  } catch {
    return EMPTY_CONFIG;
  }
}

export function matches(session: SessionState, when: RouterMatch): boolean {
  if (when.agent && session.agent !== when.agent) return false;
  if (when.status && session.status !== when.status) return false;
  if (when.cwdIncludes && !session.cwd?.includes(when.cwdIncludes)) return false;
  if (when.titleIncludes && !session.title?.includes(when.titleIncludes)) return false;
  return true;
}

export function stableRuleKey(rule: RouterRule, index: number): string {
  return rule.id ?? `rule-${index}`;
}

export function fireKey(ruleKey: string, sessionId: string, status: string): string {
  return `${ruleKey}::${sessionId}::${status}`;
}

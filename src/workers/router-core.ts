import { TriggerAction, type ISdk } from 'iii-sdk';
import type { SessionState } from '../types.js';
import {
  fireKey,
  loadRules,
  matches,
  stableRuleKey,
  type RouterAction,
  type RouterRule,
} from '../router.js';

export const FIRED_SCOPE = 'iiiterm:router:fired';
export const CAPTURE_SCOPE = 'iiiterm:router:results';

const sessionLocks = new Map<string, Promise<void>>();

async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  sessionLocks.set(sessionId, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(sessionId) === prev.then(() => next)) sessionLocks.delete(sessionId);
  }
}

export async function loadCapture(
  iii: ISdk,
  name: string,
  sessionId: string,
): Promise<unknown | undefined> {
  const res = (await iii.trigger({
    function_id: 'state::get',
    payload: { scope: CAPTURE_SCOPE, key: `${name}::${sessionId}` },
  })) as { value?: unknown };
  return res?.value;
}

export async function storeCapture(
  iii: ISdk,
  name: string,
  sessionId: string,
  value: unknown,
): Promise<void> {
  await iii.trigger({
    function_id: 'state::set',
    payload: { scope: CAPTURE_SCOPE, key: `${name}::${sessionId}`, value },
  });
}

export async function loadFiredSet(iii: ISdk): Promise<Set<string>> {
  const res = (await iii.trigger({
    function_id: 'state::list',
    payload: { scope: FIRED_SCOPE },
  })) as { items?: Array<{ key: string }> };
  return new Set((res.items ?? []).map((i) => i.key));
}

export async function markFired(iii: ISdk, key: string): Promise<void> {
  await iii.trigger({
    function_id: 'state::set',
    payload: { scope: FIRED_SCOPE, key, value: Date.now() },
  });
}

function actionToTriggerAction(a: RouterAction) {
  if (a.action === 'enqueue' && a.queue) return TriggerAction.Enqueue({ queue: a.queue });
  if (a.action === 'void') return TriggerAction.Void();
  return undefined;
}

async function runVerify(
  iii: ISdk,
  rule: RouterRule,
  ruleKey: string,
  session: SessionState,
): Promise<boolean> {
  if (!rule.verify) return true;
  try {
    const res = (await iii.trigger({
      function_id: rule.verify.function_id,
      payload: { ...(rule.verify.payload ?? {}), session },
    })) as { pass?: boolean; reason?: string } | undefined;
    if (!res?.pass) {
      process.stderr.write(
        `[iiiterm/router] ${ruleKey} verify blocked: ${res?.reason ?? 'pass=false'}\n`,
      );
      return false;
    }
    return true;
  } catch (err) {
    process.stderr.write(
      `[iiiterm/router] ${ruleKey} verify threw (treating as blocked): ${String(err)}\n`,
    );
    return false;
  }
}

async function applyRule(
  iii: ISdk,
  rule: RouterRule,
  ruleKey: string,
  session: SessionState,
  captures: Record<string, unknown>,
): Promise<number> {
  const thens = Array.isArray(rule.then) ? rule.then : [rule.then];
  let count = 0;
  for (const t of thens) {
    try {
      const result = (await iii.trigger({
        function_id: t.function_id,
        payload: { ...(t.payload ?? {}), session, captures },
        action: actionToTriggerAction(t),
      })) as unknown;
      if (rule.capture?.as) {
        await storeCapture(iii, rule.capture.as, session.id, result);
      }
      count += 1;
    } catch (err) {
      process.stderr.write(
        `[iiiterm/router] ${ruleKey} -> ${t.function_id} failed: ${String(err)}\n`,
      );
    }
  }
  return count;
}

export async function evaluateRules(
  iii: ISdk,
  fired: Set<string>,
  scope: string,
  rulesPath: string,
  target?: SessionState,
): Promise<number> {
  const { rules } = await loadRules(rulesPath);
  if (rules.length === 0) return 0;

  let sessions: SessionState[];
  if (target) {
    sessions = [target];
  } else {
    const res = (await iii.trigger({
      function_id: 'state::list',
      payload: { scope },
    })) as { items?: Array<{ key: string; value: SessionState }> };
    sessions = (res.items ?? []).map((i) => i.value);
  }

  let fires = 0;
  for (const [idx, rule] of rules.entries()) {
    const ruleKey = stableRuleKey(rule, idx);
    for (const s of sessions) {
      if (!matches(s, rule.when)) continue;
      const k = fireKey(ruleKey, s.id, s.status);
      if (rule.once !== false && fired.has(k)) continue;

      const captures: Record<string, unknown> = {};
      let missing = false;
      for (const req of rule.requires ?? []) {
        const v = await loadCapture(iii, req.name, s.id);
        if (v === undefined || v === null) {
          if (req.required !== false) {
            missing = true;
            break;
          }
        } else {
          captures[req.name] = v;
        }
      }
      if (missing) continue;

      fired.add(k);
      await markFired(iii, k);
      const ok = await runVerify(iii, rule, ruleKey, s);
      if (!ok) continue;

      fires += await withSessionLock(s.id, () =>
        applyRule(iii, rule, ruleKey, s, captures),
      );
    }
  }
  return fires;
}

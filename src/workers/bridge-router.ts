import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { registerWorker, TriggerAction, type ISdk } from 'iii-sdk';
import { loadConfig } from '../config.js';
import type { SessionState } from '../types.js';
import {
  fireKey,
  loadRules,
  matches,
  stableRuleKey,
  type RouterAction,
  type RouterRule,
} from '../router.js';

const fired = new Set<string>();

function expand(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(1).replace(/^\//, ''));
  return resolve(p);
}

function actionToTriggerAction(a: RouterAction) {
  if (a.action === 'enqueue' && a.queue) return TriggerAction.Enqueue({ queue: a.queue });
  if (a.action === 'void') return TriggerAction.Void();
  return undefined;
}

async function applyRule(
  iii: ISdk,
  rule: RouterRule,
  ruleKey: string,
  session: SessionState,
): Promise<number> {
  const thens = Array.isArray(rule.then) ? rule.then : [rule.then];
  let count = 0;
  for (const t of thens) {
    try {
      await iii.trigger({
        function_id: t.function_id,
        payload: { ...(t.payload ?? {}), session },
        action: actionToTriggerAction(t),
      });
      count += 1;
    } catch (err) {
      console.error(`[iiiterm/router] ${ruleKey} → ${t.function_id} failed:`, err);
    }
  }
  return count;
}

async function evaluate(iii: ISdk, scope: string, rulesPath: string): Promise<number> {
  const { rules } = await loadRules(rulesPath);
  if (rules.length === 0) return 0;

  const res = (await iii.trigger({
    function_id: 'state::list',
    payload: { scope },
  })) as { items?: Array<{ key: string; value: SessionState }> };
  const sessions = (res.items ?? []).map((i) => i.value);

  let fires = 0;
  for (const [idx, rule] of rules.entries()) {
    const ruleKey = stableRuleKey(rule, idx);
    for (const s of sessions) {
      if (!matches(s, rule.when)) continue;
      const k = fireKey(ruleKey, s.id, s.status);
      if (rule.once !== false && fired.has(k)) continue;
      fired.add(k);
      fires += await applyRule(iii, rule, ruleKey, s);
    }
  }
  return fires;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const rulesPath = expand(
    process.env.IIITERM_ROUTER_RULES ?? '~/.config/iiiterm/router.json',
  );

  const iii = await registerWorker(cfg.engineUrl, {
    workerName: 'iiiterm-bridge-router',
  });

  await iii.registerFunction(
    'iiiterm::router::evaluate',
    async () => {
      const fires = await evaluate(iii, cfg.stateScope, rulesPath);
      return { fires };
    },
    { description: 'Evaluate router rules against current sessions and fire matching triggers' },
  );

  await iii.registerTrigger({
    type: 'state',
    function_id: 'iiiterm::router::evaluate',
    config: { scope: cfg.stateScope },
    metadata: {},
  });

  console.log(
    `[iiiterm] bridge-router up · rules ${rulesPath} · scope ${cfg.stateScope}`,
  );
}

main().catch((err) => {
  console.error('[iiiterm] bridge-router failed:', err);
  process.exit(1);
});

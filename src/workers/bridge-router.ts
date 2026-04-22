import { registerWorker, TriggerAction, type ISdk } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { attachSdkShutdown } from '../lifecycle.js';
import { expand } from '../paths.js';
import type { SessionState } from '../types.js';
import {
  fireKey,
  loadRules,
  matches,
  stableRuleKey,
  type RouterAction,
  type RouterRule,
} from '../router.js';

const FIRED_SCOPE = 'iiiterm:router:fired';

async function loadFiredSet(iii: ISdk): Promise<Set<string>> {
  const res = (await iii.trigger({
    function_id: 'state::list',
    payload: { scope: FIRED_SCOPE },
  })) as { items?: Array<{ key: string }> };
  return new Set((res.items ?? []).map((i) => i.key));
}

async function markFired(iii: ISdk, key: string): Promise<void> {
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
      process.stderr.write(
        `[iiiterm/router] ${ruleKey} -> ${t.function_id} failed: ${String(err)}\n`,
      );
    }
  }
  return count;
}

async function evaluate(
  iii: ISdk,
  fired: Set<string>,
  scope: string,
  rulesPath: string,
): Promise<number> {
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
      await markFired(iii, k);
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
  attachSdkShutdown(iii);

  const fired = await loadFiredSet(iii);

  await iii.registerFunction(
    'iiiterm::router::evaluate',
    async () => {
      const fires = await evaluate(iii, fired, cfg.stateScope, rulesPath);
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

  process.stdout.write(
    `[iiiterm] bridge-router up · rules ${rulesPath} · scope ${cfg.stateScope} · fired-keys ${fired.size} restored\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] bridge-router failed: ${String(err)}\n`);
  process.exit(1);
});

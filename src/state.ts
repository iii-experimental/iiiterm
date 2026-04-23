import type { ISdk } from 'iii-sdk';
import type { SessionState } from './types.js';
import { unseenForTransition } from './sessions/unseen.js';

export async function writeSession(
  iii: ISdk,
  scope: string,
  session: SessionState,
  opts: { computeUnseen?: boolean } = {},
): Promise<void> {
  let value = session;
  if (opts.computeUnseen) {
    const prev = await getSession(iii, scope, session.id);
    value = { ...session, unseen: unseenForTransition(prev, session) };
  }
  await iii.trigger({
    function_id: 'state::set',
    payload: { scope, key: session.id, value },
  });
}

export async function listSessions(
  iii: ISdk,
  scope: string,
): Promise<SessionState[]> {
  const res = (await iii.trigger({
    function_id: 'state::list',
    payload: { scope },
  })) as { items?: Array<{ key: string; value: SessionState }> };
  return (res.items ?? []).map((item) => item.value);
}

export async function getSession(
  iii: ISdk,
  scope: string,
  id: string,
): Promise<SessionState | null> {
  const res = (await iii.trigger({
    function_id: 'state::get',
    payload: { scope, key: id },
  })) as { value: SessionState | null };
  return res.value ?? null;
}

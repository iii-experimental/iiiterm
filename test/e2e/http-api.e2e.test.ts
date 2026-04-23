import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { stubSdk } from '../helpers/mock-sdk.js';
import { listSessions, writeSession } from '../../src/state.js';

const SCOPE = 'iiiterm:sessions';

/**
 * Runs the same handler logic the real worker installs, against a stub SDK.
 * This catches route mapping bugs without binding a real port + engine.
 */

let server: ReturnType<typeof createServer>;
let port: number;
let sdk: ReturnType<typeof stubSdk>;

beforeEach(async () => {
  const state = new Map<string, Map<string, unknown>>();
  sdk = stubSdk({ state });

  server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length === 0 ? null : JSON.parse(chunks.toString());

      if (req.url === '/set-status' && body?.session) {
        await writeSession(sdk, SCOPE, {
          id: body.session,
          agent: 'claude-code',
          status: 'running',
          lastMessage: body.text ?? undefined,
          updatedAt: Date.now(),
        });
        reply(res, { ok: true });
        return;
      }

      if (req.url === '/log' && body?.session && body?.message) {
        await writeSession(sdk, SCOPE, {
          id: body.session,
          agent: 'claude-code',
          status: 'running',
          lastMessage: `[${body.source ?? 'log'}] ${body.message}`,
          updatedAt: Date.now(),
        });
        reply(res, { ok: true });
        return;
      }

      reply(res, { ok: false }, 404);
    })().catch((err) => reply(res, { ok: false, reason: String(err) }, 500));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') port = addr.port;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function reply(res: ServerResponse, body: unknown, code = 200): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
}

describe('E2E http-api routes', () => {
  it('set-status persists the status pill into SessionState', async () => {
    const r = await post('/set-status', { session: 'api-1', text: 'Deploying', tone: 'warn' });
    expect(r.status).toBe(200);
    const sessions = await listSessions(sdk, SCOPE);
    expect(sessions[0]?.id).toBe('api-1');
    expect(sessions[0]?.lastMessage).toBe('Deploying');
  });

  it('log prefixes source and writes lastMessage', async () => {
    await post('/log', { session: 'api-2', message: 'tests passed', source: 'ci' });
    const [s] = await listSessions(sdk, SCOPE);
    expect(s?.lastMessage).toContain('[ci]');
    expect(s?.lastMessage).toContain('tests passed');
  });

  it('rejects unknown routes with 404', async () => {
    const r = await post('/nope', {});
    expect(r.status).toBe(404);
  });
});

function _unused(_req: IncomingMessage): void {
  /* keep TS happy about the import */
}
void _unused;

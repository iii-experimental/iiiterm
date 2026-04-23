import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { registerWorker, type ISdk } from 'iii-sdk';
import { loadConfig } from '../config.js';
import { iiitermHost } from '../host.js';
import { attachSdkShutdown, onShutdown } from '../lifecycle.js';
import { getSession, writeSession } from '../state.js';
import type { SessionState, SessionStatus } from '../types.js';

const PORT = Number(process.env.IIITERM_HTTP_PORT ?? 7391);
const HOST_BIND = process.env.IIITERM_HTTP_BIND ?? '127.0.0.1';

interface SetStatusBody {
  session: string;
  text: string | null;
  tone?: 'neutral' | 'info' | 'success' | 'warn' | 'error';
  status?: SessionStatus;
}

interface SetProgressBody {
  session: string;
  current?: number;
  total?: number;
  percent?: number;
  label?: string;
  clear?: boolean;
}

interface LogBody {
  session: string;
  message: string;
  source?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warn' | 'error';
}

interface NotifyBody {
  session?: string;
  title: string;
  body?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warn' | 'error';
}

async function readJson<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    return null;
  }
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function ensureSession(
  iii: ISdk,
  scope: string,
  id: string,
  seedStatus: SessionStatus = 'idle',
): Promise<SessionState> {
  const existing = await getSession(iii, scope, id);
  if (existing) return existing;
  const s: SessionState = {
    id,
    agent: 'claude-code',
    status: seedStatus,
    updatedAt: Date.now(),
    host: iiitermHost(),
  };
  await writeSession(iii, scope, s);
  return s;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const iii = await registerWorker(cfg.engineUrl, { workerName: 'iiiterm-http-api' });
  attachSdkShutdown(iii);

  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST') return send(res, 405, { ok: false, reason: 'POST only' });
      if (!req.url) return send(res, 400, { ok: false });

      if (req.url === '/set-status') {
        const body = await readJson<SetStatusBody>(req);
        if (!body?.session) return send(res, 400, { ok: false, reason: 'session required' });
        const s = await ensureSession(iii, cfg.stateScope, body.session);
        const next: SessionState = {
          ...s,
          lastMessage: body.text ?? undefined,
          status: body.status ?? s.status,
          updatedAt: Date.now(),
          lastTurnAt: Date.now(),
        };
        await writeSession(iii, cfg.stateScope, next, { computeUnseen: true });
        return send(res, 200, { ok: true });
      }

      if (req.url === '/set-progress') {
        const body = await readJson<SetProgressBody>(req);
        if (!body?.session) return send(res, 400, { ok: false, reason: 'session required' });
        const s = await ensureSession(iii, cfg.stateScope, body.session);
        const pct = body.clear
          ? undefined
          : body.percent !== undefined
            ? body.percent
            : body.total
              ? (body.current ?? 0) / body.total
              : undefined;
        const label = body.label ?? `${body.current ?? 0}/${body.total ?? 0}`;
        const title = pct === undefined ? s.title : `${label} · ${Math.round(pct * 100)}%`;
        await writeSession(iii, cfg.stateScope, { ...s, title, updatedAt: Date.now() });
        return send(res, 200, { ok: true });
      }

      if (req.url === '/log') {
        const body = await readJson<LogBody>(req);
        if (!body?.session || !body.message) return send(res, 400, { ok: false, reason: 'session + message required' });
        const s = await ensureSession(iii, cfg.stateScope, body.session);
        await writeSession(iii, cfg.stateScope, {
          ...s,
          lastMessage: `[${body.source ?? 'log'}] ${body.message}`.slice(0, 200),
          lastTurnAt: Date.now(),
          updatedAt: Date.now(),
        });
        return send(res, 200, { ok: true });
      }

      if (req.url === '/notify') {
        const body = await readJson<NotifyBody>(req);
        if (!body?.title) return send(res, 400, { ok: false, reason: 'title required' });
        await iii.trigger({
          function_id: 'engine::log::info',
          payload: {
            source: 'iiiterm/http-api/notify',
            title: body.title,
            body: body.body,
            session: body.session,
            tone: body.tone,
            ts: Date.now(),
          },
        }).catch(() => {});
        return send(res, 200, { ok: true });
      }

      send(res, 404, { ok: false });
    })().catch((err) => send(res, 500, { ok: false, reason: String(err) }));
  });

  server.listen(PORT, HOST_BIND, () => {
    process.stdout.write(`[iiiterm] http-api listening on http://${HOST_BIND}:${PORT}\n`);
  });
  onShutdown(() => {
    server.close();
  });
}

main().catch((err) => {
  process.stderr.write(`[iiiterm] http-api failed: ${String(err)}\n`);
  process.exit(1);
});

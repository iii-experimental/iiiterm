import { existsSync } from 'node:fs';
import type { SessionState } from '../types.js';

interface SqliteRow {
  id: string;
  title?: string | null;
  cwd?: string | null;
  updated_at?: number | null;
  last_role?: string | null;
  last_content?: string | null;
  token_in?: number | null;
  token_out?: number | null;
}

type BetterSqliteDatabase = {
  prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
  close: () => void;
};

type BetterSqliteConstructor = new (
  path: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => BetterSqliteDatabase;

let Database: BetterSqliteConstructor | null = null;
let attempted = false;

async function loadDriver(): Promise<BetterSqliteConstructor | null> {
  if (attempted) return Database;
  attempted = true;
  try {
    const mod = (await import('better-sqlite3')) as
      | { default: BetterSqliteConstructor }
      | BetterSqliteConstructor;
    Database = 'default' in mod ? mod.default : mod;
  } catch {
    Database = null;
  }
  return Database;
}

const DEFAULT_QUERY = `
SELECT
  s.id            AS id,
  s.title         AS title,
  s.cwd           AS cwd,
  s.updated_at    AS updated_at,
  (SELECT role    FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_role,
  (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_content
FROM sessions s
ORDER BY s.updated_at DESC
LIMIT 200
`;

function inferStatus(lastRole: string | null | undefined, ageMs: number): SessionState['status'] {
  if (lastRole === 'user') return 'waiting';
  if (ageMs < 5_000) return 'running';
  return 'idle';
}

export async function scanOpencodeDb(
  dbPath: string,
  customQuery?: string,
): Promise<SessionState[]> {
  if (!existsSync(dbPath)) return [];
  const Db = await loadDriver();
  if (!Db) return [];

  const db = new Db(dbPath, { readonly: true, fileMustExist: true });
  const out: SessionState[] = [];
  try {
    const rows = db.prepare(customQuery ?? DEFAULT_QUERY).all() as SqliteRow[];
    for (const r of rows) {
      const updatedAt = typeof r.updated_at === 'number' ? r.updated_at * (r.updated_at < 1e12 ? 1000 : 1) : Date.now();
      const ageMs = Date.now() - updatedAt;
      out.push({
        id: r.id,
        agent: 'opencode',
        title: r.title?.slice(0, 80) ?? undefined,
        cwd: r.cwd ?? undefined,
        status: inferStatus(r.last_role, ageMs),
        lastMessage: r.last_content?.slice(0, 200) ?? undefined,
        lastTurnAt: updatedAt,
        tokensIn: r.token_in ?? undefined,
        tokensOut: r.token_out ?? undefined,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // schema mismatch — bail quietly, operator can supply a custom query
  } finally {
    db.close();
  }
  return out;
}

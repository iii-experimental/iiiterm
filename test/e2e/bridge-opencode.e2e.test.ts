import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubSdk } from '../helpers/mock-sdk.js';
import { listSessions, writeSession } from '../../src/state.js';
import { scanOpencodeDb } from '../../src/watchers/opencode.js';

const SCOPE = 'iiiterm:sessions';

type BetterSqliteCtor = new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): { run: (...args: unknown[]) => void };
  close(): void;
};

async function loadDriver(): Promise<BetterSqliteCtor | null> {
  try {
    const mod = (await import('better-sqlite3')) as
      | { default: BetterSqliteCtor }
      | BetterSqliteCtor;
    return 'default' in mod ? mod.default : mod;
  } catch {
    return null;
  }
}

describe('E2E bridge-opencode', () => {
  it('reads a live SQLite fixture and writes sessions to state', async () => {
    const Db = await loadDriver();
    if (!Db) {
      /* optional dep missing -- smoke test only */
      expect(await scanOpencodeDb('/does/not/exist.db')).toEqual([]);
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), 'iiiterm-e2e-oc-'));
    const dbPath = join(dir, 'opencode.db');
    try {
      const db = new Db(dbPath);
      db.exec(
        `
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          title TEXT,
          cwd TEXT,
          updated_at INTEGER
        );
        CREATE TABLE messages (
          session_id TEXT,
          role TEXT,
          content TEXT,
          created_at INTEGER
        );
      `,
      );
      db.prepare(`INSERT INTO sessions (id, title, cwd, updated_at) VALUES (?, ?, ?, ?)`).run(
        's1',
        'fix build',
        '/tmp/build',
        Date.now(),
      );
      db.prepare(
        `INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
      ).run('s1', 'assistant', 'patched the tsconfig', Date.now());
      db.close();

      const sdk = stubSdk();
      const scanned = await scanOpencodeDb(dbPath);
      for (const s of scanned) await writeSession(sdk, SCOPE, s);

      const sessions = await listSessions(sdk, SCOPE);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe('s1');
      expect(sessions[0]?.agent).toBe('opencode');
      expect(sessions[0]?.title).toBe('fix build');
      expect(sessions[0]?.lastMessage).toBe('patched the tsconfig');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SessionState, SessionStatus } from '../types.js';
import type { ErrorReporter } from '../errors.js';

interface CodexItem {
  role?: 'user' | 'assistant' | 'system' | 'tool';
  type?: string;
  content?: Array<{ type: string; text?: string }> | string;
  timestamp?: string;
}

interface CodexRollout {
  session?: {
    id?: string;
    timestamp?: string;
    instructions?: string;
  };
  turn_context?: { cwd?: string };
  items?: CodexItem[];
}

export interface ScanOptions {
  onError?: ErrorReporter;
  maxAgeMs?: number;
}

const fileOffsets = new Map<string, number>();

function extractText(content: CodexItem['content']): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .map((b) => b.text ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Codex transcripts carry explicit event types. Map them directly instead of
 * guessing from role + age. Event names follow the opensessions convention
 * so third-party rollout shapes stay compatible.
 */
export function inferCodexStatus(
  last: CodexItem | undefined,
  items: CodexItem[],
  ageMs: number,
): SessionStatus {
  if (!last) return 'idle';

  if (last.type === 'turn_aborted') return 'interrupted';
  if (last.type === 'task_complete' || last.type === 'final_answer') return 'done';
  if (last.type === 'error') return 'error';

  if (last.role === 'assistant' && last.type === 'commentary') return 'running';

  if (last.role === 'user' || last.type === 'user_message') return 'waiting';
  if (last.role === 'tool') return 'running';

  const recentTool = items
    .slice(-3)
    .some((i) => i.role === 'tool' || (i.type ?? '').startsWith('tool_'));
  if (recentTool && ageMs < 5_000) return 'running';

  if (ageMs < 5_000) return 'running';
  return 'idle';
}

async function parseRollout(
  filePath: string,
  onError: ErrorReporter | undefined,
): Promise<SessionState | null> {
  let buf: string;
  try {
    buf = await readFile(filePath, 'utf8');
  } catch (err) {
    onError?.(`read ${filePath}`, err);
    return null;
  }
  let parsed: CodexRollout;
  try {
    parsed = JSON.parse(buf);
  } catch (err) {
    onError?.(`parse ${filePath}`, err);
    return null;
  }

  const id = parsed.session?.id ?? basename(filePath, '.json');
  const items = parsed.items ?? [];
  const last = items[items.length - 1];
  const firstUser = items.find((i) => i.role === 'user');

  const startedAt = parsed.session?.timestamp
    ? new Date(parsed.session.timestamp).getTime()
    : undefined;
  const lastTurnAt = last?.timestamp ? new Date(last.timestamp).getTime() : startedAt ?? Date.now();
  const ageMs = Date.now() - lastTurnAt;

  return {
    id,
    agent: 'codex',
    title: extractText(firstUser?.content)?.slice(0, 80),
    cwd: parsed.turn_context?.cwd,
    status: inferCodexStatus(last, items, ageMs),
    lastMessage: extractText(last?.content)?.slice(0, 200),
    lastTurnAt,
    updatedAt: Date.now(),
  };
}

export async function scanCodexSessions(
  rootDir: string,
  opts: ScanOptions = {},
): Promise<SessionState[]> {
  const { onError, maxAgeMs } = opts;
  const now = Date.now();
  const out: SessionState[] = [];
  const seen = new Set<string>();
  let files: string[];
  try {
    files = await readdir(rootDir);
  } catch (err) {
    onError?.(`readdir ${rootDir}`, err);
    return out;
  }

  for (const file of files) {
    if (!file.endsWith('.json') && !file.endsWith('.jsonl')) continue;
    const full = join(rootDir, file);
    seen.add(full);

    let size: number;
    let mtimeMs: number;
    try {
      const s = await stat(full);
      size = s.size;
      mtimeMs = s.mtimeMs;
    } catch (err) {
      onError?.(`stat ${full}`, err);
      continue;
    }

    if (maxAgeMs !== undefined && now - mtimeMs > maxAgeMs) continue;

    const prev = fileOffsets.get(full);
    if (prev === size) continue;
    fileOffsets.set(full, size);

    const session = await parseRollout(full, onError);
    if (!session) continue;
    session.updatedAt = mtimeMs;
    out.push(session);
  }

  for (const key of fileOffsets.keys()) {
    if (!seen.has(key)) fileOffsets.delete(key);
  }

  return out;
}

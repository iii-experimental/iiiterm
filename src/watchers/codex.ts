import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SessionState } from '../types.js';

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

function inferStatus(last: CodexItem | undefined, ageMs: number): SessionState['status'] {
  if (!last) return 'idle';
  if (last.type === 'error') return 'error';
  if (last.role === 'user') return 'waiting';
  if (ageMs < 5_000) return 'running';
  return 'idle';
}

async function parseRollout(filePath: string): Promise<SessionState | null> {
  const buf = await readFile(filePath, 'utf8');
  let parsed: CodexRollout;
  try {
    parsed = JSON.parse(buf);
  } catch {
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
    status: inferStatus(last, ageMs),
    lastMessage: extractText(last?.content)?.slice(0, 200),
    lastTurnAt,
    updatedAt: Date.now(),
  };
}

export async function scanCodexSessions(rootDir: string): Promise<SessionState[]> {
  const out: SessionState[] = [];
  let files: string[];
  try {
    files = await readdir(rootDir);
  } catch {
    return out;
  }

  for (const file of files) {
    if (!file.endsWith('.json') && !file.endsWith('.jsonl')) continue;
    const full = join(rootDir, file);

    let size: number;
    let mtimeMs: number;
    try {
      const s = await stat(full);
      size = s.size;
      mtimeMs = s.mtimeMs;
    } catch {
      continue;
    }

    const prev = fileOffsets.get(full);
    if (prev === size) continue;
    fileOffsets.set(full, size);

    const session = await parseRollout(full);
    if (!session) continue;
    session.updatedAt = mtimeMs;
    out.push(session);
  }

  return out;
}
